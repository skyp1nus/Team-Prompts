using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

public interface IPromptService
{
    Task<IReadOnlyList<PromptListItemDto>> ListAsync(Guid? workspaceId, PromptKind? kind, CancellationToken ct = default);
    Task<PromptDetailDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<PromptDetailDto> CreateAsync(CreatePromptRequest req, CancellationToken ct = default);
    Task<PromptDetailDto> UpdateAsync(Guid id, UpdatePromptRequest req, CancellationToken ct = default);
    Task ReorderAsync(ReorderPromptsRequest req, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
    Task<PromptVersionDto> CreateVersionAsync(Guid promptId, CreateVersionRequest req, CancellationToken ct = default);
    Task<PromptDetailDto> PromoteAsync(Guid promptId, Guid versionId, CancellationToken ct = default);
}

public sealed class PromptService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IUserDirectory users,
    IActivityLogger activity) : IPromptService
{
    public async Task<IReadOnlyList<PromptListItemDto>> ListAsync(Guid? workspaceId, PromptKind? kind, CancellationToken ct = default)
    {
        var q = db.Prompts.AsNoTracking();
        if (kind is { } k)
            q = q.Where(p => p.Kind == k);

        // SortOrder is only comparable *within* a workspace (each space is numbered 0..n on its own), so
        // it drives the order only for a scoped list. An unscoped (cross-workspace) list falls back to a
        // coherent global newest-first order instead of interleaving spaces by a non-global number.
        var ordered = workspaceId is { } wsId
            ? q.Where(p => p.WorkspaceId == wsId).OrderBy(p => p.SortOrder).ThenByDescending(p => p.UpdatedAt)
            : q.OrderByDescending(p => p.UpdatedAt);

        var rows = await ordered
            .Select(p => new
            {
                p.Id, p.Name, p.MainVersionId, p.CreatedByUserId, p.CreatedAt, p.UpdatedAt,
                VersionCount = p.Versions.Count, p.Kind, p.UseKeywords,
            })
            .ToListAsync(ct);

        var dir = await users.GetAsync(rows.Select(r => r.CreatedByUserId), ct);
        return rows.Select(r => new PromptListItemDto(
            r.Id, r.Name, r.MainVersionId, Attribution.Of(dir, r.CreatedByUserId),
            r.CreatedAt, r.UpdatedAt, r.VersionCount, r.Kind, r.UseKeywords)).ToList();
    }

    public async Task<PromptDetailDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var prompt = await db.Prompts.AsNoTracking()
            .Include(p => p.Versions)
            .FirstOrDefaultAsync(p => p.Id == id, ct);
        if (prompt is null) return null;

        var ids = prompt.Versions.Select(v => v.AuthorUserId).Append(prompt.CreatedByUserId).Distinct();
        var dir = await users.GetAsync(ids, ct);

        var versions = prompt.Versions
            // ThenBy(Id) matches GenerationService.BuildVersionLookupAsync so the "vN" the detail UI
            // numbers off this list agrees with the session badge even when CreatedAt ties.
            .OrderBy(v => v.CreatedAt).ThenBy(v => v.Id)
            .Select(v => new PromptVersionDto(v.Id, v.PromptId, v.ParentVersionId, v.Content,
                Attribution.Of(dir, v.AuthorUserId), v.Note, v.IsMain, v.CreatedAt))
            .ToList();

        return new PromptDetailDto(prompt.Id, prompt.Name, prompt.MainVersionId,
            Attribution.Of(dir, prompt.CreatedByUserId), prompt.CreatedAt, prompt.UpdatedAt, versions,
            prompt.Kind, prompt.UseKeywords);
    }

    public async Task<PromptDetailDto> CreateAsync(CreatePromptRequest req, CancellationToken ct = default)
    {
        if (!await db.Workspaces.AnyAsync(w => w.Id == req.WorkspaceId, ct))
            throw new AppValidationException("Unknown workspace.");

        var userId = currentUser.UserId ?? string.Empty;
        // New prompts land at the top of the library (lowest SortOrder), matching the prior
        // newest-first default; the team can drag them elsewhere afterwards.
        var minOrder = await db.Prompts
            .Where(p => p.WorkspaceId == req.WorkspaceId)
            .Select(p => (int?)p.SortOrder)
            .MinAsync(ct) ?? 0;
        var prompt = new Prompt
        {
            WorkspaceId = req.WorkspaceId,
            Name = req.Name.Trim(),
            Kind = req.Kind,
            UseKeywords = req.UseKeywords,
            CreatedByUserId = userId,
            SortOrder = minOrder - 1,
        };
        var version = new PromptVersion
        {
            PromptId = prompt.Id,
            Content = req.Content,
            AuthorUserId = userId,
            Note = "Initial version",
            IsMain = true,
        };

        db.Prompts.Add(prompt);
        db.PromptVersions.Add(version);
        await db.SaveChangesAsync(ct); // insert both first (MainVersionId null) to avoid a circular FK

        prompt.MainVersionId = version.Id;
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.PromptCreated,
            TargetType: ActivityTargetType.Prompt, TargetId: prompt.Id,
            Summary: $"Created prompt \"{prompt.Name}\""), ct);

        return (await GetAsync(prompt.Id, ct))!;
    }

    public async Task<PromptDetailDto> UpdateAsync(Guid id, UpdatePromptRequest req, CancellationToken ct = default)
    {
        var prompt = await db.Prompts.FirstOrDefaultAsync(p => p.Id == id, ct)
                     ?? throw new NotFoundException("Prompt not found.");
        prompt.Name = req.Name.Trim();
        if (req.UseKeywords is { } useKeywords)
            prompt.UseKeywords = useKeywords;
        await db.SaveChangesAsync(ct);
        return (await GetAsync(id, ct))!;
    }

    public async Task ReorderAsync(ReorderPromptsRequest req, CancellationToken ct = default)
    {
        // Build the full target order from the workspace's current prompts: the caller's ids first (in
        // the given order, de-duped and limited to this workspace), then any prompt the caller omitted —
        // kept in its current order — appended after. This makes the result a clean, collision-free
        // 0..n-1 even if a partial, padded or stale list arrives, so SortOrder never duplicates.
        var existing = await db.Prompts
            .Where(p => p.WorkspaceId == req.WorkspaceId)
            .OrderBy(p => p.SortOrder).ThenByDescending(p => p.UpdatedAt)
            .Select(p => p.Id)
            .ToListAsync(ct);
        var inWorkspace = existing.ToHashSet();

        var seen = new HashSet<Guid>();
        var ordered = new List<Guid>(existing.Count);
        foreach (var id in req.OrderedIds)
            if (inWorkspace.Contains(id) && seen.Add(id))
                ordered.Add(id);
        foreach (var id in existing)
            if (seen.Add(id))
                ordered.Add(id);

        // Assign each its index as SortOrder. ExecuteUpdate keeps this off the change tracker so a reorder
        // doesn't bump UpdatedAt — it's a shared layout move, not a content edit. Commit as one unit.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        for (var i = 0; i < ordered.Count; i++)
        {
            var id = ordered[i];
            var order = i;
            await db.Prompts
                .Where(p => p.Id == id && p.WorkspaceId == req.WorkspaceId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.SortOrder, order), ct);
        }
        await tx.CommitAsync(ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var prompt = await db.Prompts.FirstOrDefaultAsync(p => p.Id == id, ct)
                     ?? throw new NotFoundException("Prompt not found.");
        // Break the Main pointer first so cascade-delete of versions has no dangling FK.
        var name = prompt.Name;
        prompt.MainVersionId = null;
        await db.SaveChangesAsync(ct);
        db.Prompts.Remove(prompt);
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.PromptDeleted,
            TargetType: ActivityTargetType.Prompt, TargetId: id,
            Summary: $"Deleted prompt \"{name}\""), ct);
    }

    public async Task<PromptVersionDto> CreateVersionAsync(Guid promptId, CreateVersionRequest req, CancellationToken ct = default)
    {
        var prompt = await db.Prompts.Include(p => p.Versions)
            .FirstOrDefaultAsync(p => p.Id == promptId, ct)
            ?? throw new NotFoundException("Prompt not found.");

        if (prompt.Versions.All(v => v.Id != req.ParentVersionId))
            throw new AppValidationException("Parent version does not belong to this prompt.");

        var version = new PromptVersion
        {
            PromptId = promptId,
            ParentVersionId = req.ParentVersionId,
            Content = req.Content,
            AuthorUserId = currentUser.UserId ?? string.Empty,
            Note = req.Note,
            IsMain = false,
        };
        db.PromptVersions.Add(version);
        // Touch the prompt so list ordering reflects the new activity.
        prompt.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.PromptVersionCreated,
            TargetType: ActivityTargetType.Prompt, TargetId: promptId,
            Summary: $"Added a version to \"{prompt.Name}\""), ct);

        var dir = await users.GetAsync([version.AuthorUserId], ct);
        return new PromptVersionDto(version.Id, promptId, version.ParentVersionId, version.Content,
            Attribution.Of(dir, version.AuthorUserId), version.Note, version.IsMain, version.CreatedAt);
    }

    public async Task<PromptDetailDto> PromoteAsync(Guid promptId, Guid versionId, CancellationToken ct = default)
    {
        var prompt = await db.Prompts.Include(p => p.Versions)
            .FirstOrDefaultAsync(p => p.Id == promptId, ct)
            ?? throw new NotFoundException("Prompt not found.");

        var target = prompt.Versions.FirstOrDefault(v => v.Id == versionId)
                     ?? throw new NotFoundException("Version not found.");

        foreach (var v in prompt.Versions)
            v.IsMain = v.Id == versionId;
        prompt.MainVersionId = target.Id;
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.PromptVersionPromoted,
            TargetType: ActivityTargetType.Prompt, TargetId: promptId,
            Summary: $"Promoted a version of \"{prompt.Name}\""), ct);

        return (await GetAsync(promptId, ct))!;
    }
}
