using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

public interface IPromptService
{
    Task<IReadOnlyList<PromptListItemDto>> ListAsync(CancellationToken ct = default);
    Task<PromptDetailDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<PromptDetailDto> CreateAsync(CreatePromptRequest req, CancellationToken ct = default);
    Task<PromptDetailDto> RenameAsync(Guid id, string name, CancellationToken ct = default);
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
    public async Task<IReadOnlyList<PromptListItemDto>> ListAsync(CancellationToken ct = default)
    {
        var rows = await db.Prompts.AsNoTracking()
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new
            {
                p.Id, p.Name, p.MainVersionId, p.CreatedByUserId, p.CreatedAt, p.UpdatedAt,
                VersionCount = p.Versions.Count,
            })
            .ToListAsync(ct);

        var dir = await users.GetAsync(rows.Select(r => r.CreatedByUserId), ct);
        return rows.Select(r => new PromptListItemDto(
            r.Id, r.Name, r.MainVersionId, Attribution.Of(dir, r.CreatedByUserId),
            r.CreatedAt, r.UpdatedAt, r.VersionCount)).ToList();
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
            .OrderBy(v => v.CreatedAt)
            .Select(v => new PromptVersionDto(v.Id, v.PromptId, v.ParentVersionId, v.Content,
                Attribution.Of(dir, v.AuthorUserId), v.Note, v.IsMain, v.CreatedAt))
            .ToList();

        return new PromptDetailDto(prompt.Id, prompt.Name, prompt.MainVersionId,
            Attribution.Of(dir, prompt.CreatedByUserId), prompt.CreatedAt, prompt.UpdatedAt, versions);
    }

    public async Task<PromptDetailDto> CreateAsync(CreatePromptRequest req, CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? string.Empty;
        var prompt = new Prompt { Name = req.Name.Trim(), CreatedByUserId = userId };
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

    public async Task<PromptDetailDto> RenameAsync(Guid id, string name, CancellationToken ct = default)
    {
        var prompt = await db.Prompts.FirstOrDefaultAsync(p => p.Id == id, ct)
                     ?? throw new NotFoundException("Prompt not found.");
        prompt.Name = name.Trim();
        await db.SaveChangesAsync(ct);
        return (await GetAsync(id, ct))!;
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
