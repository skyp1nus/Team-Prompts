using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Abstractions;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

public interface IScriptProjectService
{
    Task<IReadOnlyList<ScriptProjectListItemDto>> ListAsync(Guid? workspaceId, string? search, CancellationToken ct = default);
    Task<ScriptProjectDto?> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>Upload a source file and wrap it in a new project (the file becomes the Original Script).</summary>
    Task<ScriptProjectDto> CreateFromUploadAsync(Guid workspaceId, string fileName, string contentType, Stream content, string? name, CancellationToken ct = default);

    Task<ScriptProjectDto> RenameAsync(Guid id, string name, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>Set the project's keyword list. Creates the keyword Script lazily for legacy projects
    /// that predate the feature. <paramref name="expectedVersion"/> is the keyword Script's last-loaded
    /// concurrency version — when it no longer matches the stored row the save is rejected with a
    /// <see cref="ConflictException"/> (409) instead of clobbering a concurrent edit.</summary>
    Task<ScriptProjectDto> UpdateKeywordsAsync(Guid projectId, string content, uint? expectedVersion = null, CancellationToken ct = default);

    Task<IReadOnlyList<ScriptDto>> ListVariantsAsync(Guid projectId, CancellationToken ct = default);

    /// <summary>Queue generation of one new script-variant from the project's source script.</summary>
    Task<ScriptDto> GenerateVariantAsync(Guid projectId, CreateScriptVariantRequest req, CancellationToken ct = default);

    /// <summary>Make a variant the project's canonical script (repoints OriginalScriptId, like promote-to-main).</summary>
    Task<ScriptProjectDto> PromoteVariantAsync(Guid projectId, Guid variantId, CancellationToken ct = default);

    Task DeleteVariantAsync(Guid projectId, Guid variantId, CancellationToken ct = default);
}

public sealed class ScriptProjectService(
    IAppDbContext db,
    IFileStorage files,
    ITextExtractor extractor,
    ICurrentUser currentUser,
    IUserDirectory users,
    IActivityLogger activity,
    IJobScheduler scheduler) : IScriptProjectService
{
    public async Task<IReadOnlyList<ScriptProjectListItemDto>> ListAsync(Guid? workspaceId, string? search, CancellationToken ct = default)
    {
        var q = db.ScriptProjects.AsNoTracking();
        if (workspaceId is { } wsId)
            q = q.Where(p => p.WorkspaceId == wsId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            q = q.Where(p => p.Name.ToLower().Contains(term));
        }

        // Scoped: honour the team-wide SortOrder (rail order). Unscoped: coherent newest-first.
        var ordered = workspaceId is not null
            ? q.OrderBy(p => p.SortOrder).ThenByDescending(p => p.UpdatedAt)
            : q.OrderByDescending(p => p.UpdatedAt);

        var rows = await ordered
            .Select(p => new
            {
                p.Id, p.WorkspaceId, p.Name, p.OriginalScriptId, p.SortOrder,
                p.CreatedByUserId, p.CreatedAt, p.UpdatedAt,
                VariantCount = p.Scripts.Count(s => s.Kind == ScriptKind.Variant),
            })
            .ToListAsync(ct);

        var dir = await users.GetAsync(rows.Select(r => r.CreatedByUserId), ct);
        return rows.Select(r => new ScriptProjectListItemDto(
            r.Id, r.WorkspaceId, r.Name, r.OriginalScriptId, r.SortOrder, r.VariantCount,
            Attribution.Of(dir, r.CreatedByUserId), r.CreatedAt, r.UpdatedAt)).ToList();
    }

    public async Task<ScriptProjectDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects.AsNoTracking()
            .Include(p => p.Scripts)
            .FirstOrDefaultAsync(p => p.Id == id, ct);
        if (project is null) return null;

        var userIds = project.Scripts.Select(s => s.CreatedByUserId).Append(project.CreatedByUserId).Distinct();
        var dir = await users.GetAsync(userIds, ct);
        return MapProject(project, project.Scripts, dir);
    }

    public async Task<ScriptProjectDto> CreateFromUploadAsync(
        Guid workspaceId, string fileName, string contentType, Stream content, string? name, CancellationToken ct = default)
    {
        if (!await db.Workspaces.AnyAsync(w => w.Id == workspaceId, ct))
            throw new AppValidationException("Unknown workspace.");

        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var type = ext switch
        {
            ".pdf" => FileType.Pdf,
            ".txt" => FileType.Txt,
            _ => throw new AppValidationException("Only .pdf and .txt files are supported."),
        };

        // Buffer once: used for both storage (original bytes) and text extraction.
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);

        ms.Position = 0;
        var key = await files.SaveAsync(fileName, contentType, ms, ct);

        ms.Position = 0;
        var text = await extractor.ExtractAsync(type, ms, ct);

        var userId = currentUser.UserId ?? string.Empty;
        var projectName = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(fileName) : name.Trim();

        // New projects land at the top of the rail (lowest SortOrder), matching the prompts convention.
        var minOrder = await db.ScriptProjects
            .Where(p => p.WorkspaceId == workspaceId)
            .Select(p => (int?)p.SortOrder)
            .MinAsync(ct) ?? 0;

        var project = new ScriptProject
        {
            WorkspaceId = workspaceId,
            Name = projectName,
            SortOrder = minOrder - 1,
            CreatedByUserId = userId,
        };
        var original = new Script
        {
            WorkspaceId = workspaceId,
            ProjectId = project.Id,
            Kind = ScriptKind.Original,
            Name = projectName,
            OriginalFileName = fileName,
            FileType = type,
            ExtractedText = text,
            StorageKey = key,
            CreatedByUserId = userId,
        };
        // Every project ships with an editable, initially-empty keyword list. Keyword-aware prompts
        // (UseKeywords=true) inject this into their generations; the team fills it in per project.
        var keywords = new Script
        {
            WorkspaceId = workspaceId,
            ProjectId = project.Id,
            Kind = ScriptKind.Keywords,
            Name = "Keywords",
            OriginalFileName = string.Empty,
            FileType = FileType.Txt,
            ExtractedText = string.Empty,
            StorageKey = null,
            CreatedByUserId = userId,
        };
        project.OriginalScriptId = original.Id;
        db.ScriptProjects.Add(project);
        db.Scripts.Add(original);
        db.Scripts.Add(keywords);
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.ScriptProjectCreated,
            TargetType: ActivityTargetType.ScriptProject, TargetId: project.Id,
            Summary: $"Created project \"{project.Name}\""), ct);

        return (await GetAsync(project.Id, ct))!;
    }

    public async Task<ScriptProjectDto> RenameAsync(Guid id, string name, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects.FirstOrDefaultAsync(p => p.Id == id, ct)
                      ?? throw new NotFoundException("Project not found.");
        project.Name = name.Trim();
        await db.SaveChangesAsync(ct);
        return (await GetAsync(id, ct))!;
    }

    public async Task<ScriptProjectDto> UpdateKeywordsAsync(Guid projectId, string content, uint? expectedVersion = null, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects.FirstOrDefaultAsync(p => p.Id == projectId, ct)
                      ?? throw new NotFoundException("Project not found.");

        var keywords = await db.Scripts
            .FirstOrDefaultAsync(s => s.ProjectId == projectId && s.Kind == ScriptKind.Keywords, ct);
        if (keywords is null)
        {
            // Legacy project (created before keywords existed): materialise its keyword Script now.
            keywords = new Script
            {
                WorkspaceId = project.WorkspaceId,
                ProjectId = projectId,
                Kind = ScriptKind.Keywords,
                Name = "Keywords",
                OriginalFileName = string.Empty,
                FileType = FileType.Txt,
                ExtractedText = content,
                StorageKey = null,
                CreatedByUserId = currentUser.UserId ?? string.Empty,
            };
            db.Scripts.Add(keywords);
        }
        else
        {
            // Optimistic concurrency: the client sends the version it last loaded. The freshly-loaded row
            // already carries the current version, so a mismatch means someone saved in between — reject
            // rather than overwrite their edit. (The xmin row-version on SaveChanges also guards the much
            // smaller load→save window automatically.)
            if (expectedVersion is { } ev && keywords.Version != ev)
                throw new ConflictException(
                    "These keywords were changed by someone else. Reload to see the latest, then reapply your edit.");
            keywords.ExtractedText = content;
        }
        await db.SaveChangesAsync(ct);

        return (await GetAsync(projectId, ct))!;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects
            .Include(p => p.Scripts)
            .FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new NotFoundException("Project not found.");

        var name = project.Name;
        var variants = project.Scripts.Where(s => s.Kind == ScriptKind.Variant).ToList();
        var originals = project.Scripts.Where(s => s.Kind == ScriptKind.Original).ToList();
        // Generated variants and the keyword list are project-only artefacts → delete them with the
        // project (variants cascade their sessions/canvas; keywords have none).
        var artifacts = project.Scripts.Where(s => s.Kind != ScriptKind.Original).ToList();

        // The uploaded Original is kept but detached (ProjectId nulled) so the source file isn't lost
        // (its blob stays referenced). Commit as one unit so a mid-way failure can't half-delete.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (artifacts.Count > 0)
            db.Scripts.RemoveRange(artifacts);
        foreach (var o in originals)
            o.ProjectId = null;
        await db.SaveChangesAsync(ct);
        db.ScriptProjects.Remove(project);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.ScriptProjectDeleted,
            TargetType: ActivityTargetType.ScriptProject, TargetId: id,
            Summary: $"Deleted project \"{name}\" ({variants.Count} variant{(variants.Count == 1 ? "" : "s")})"), ct);
    }

    public async Task<IReadOnlyList<ScriptDto>> ListVariantsAsync(Guid projectId, CancellationToken ct = default)
    {
        if (!await db.ScriptProjects.AnyAsync(p => p.Id == projectId, ct))
            throw new NotFoundException("Project not found.");

        var variants = await db.Scripts.AsNoTracking()
            .Where(s => s.ProjectId == projectId && s.Kind == ScriptKind.Variant)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(ct);
        var dir = await users.GetAsync(variants.Select(v => v.CreatedByUserId), ct);
        return variants.Select(v => ScriptService.ToDto(v, dir)).ToList();
    }

    public async Task<ScriptDto> GenerateVariantAsync(Guid projectId, CreateScriptVariantRequest req, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects.FirstOrDefaultAsync(p => p.Id == projectId, ct)
                      ?? throw new NotFoundException("Project not found.");
        if (project.OriginalScriptId is not { } sourceId)
            throw new AppValidationException("This project has no source script to transform.");

        // Resolve the prompt + version exactly like GenerationService: explicit pick (validated to
        // belong to the prompt), else the prompt's current main — so unpinned prompts use the latest.
        var prompt = await db.Prompts.AsNoTracking()
            .Where(p => p.Id == req.PromptId)
            .Select(p => new { p.Id, p.Name, p.MainVersionId, VersionIds = p.Versions.Select(v => v.Id).ToList() })
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Prompt not found.");

        Guid versionId;
        if (req.PromptVersionId is { } vid)
        {
            if (!prompt.VersionIds.Contains(vid))
                throw new AppValidationException("The selected prompt version does not belong to this prompt.");
            versionId = vid;
        }
        else
        {
            versionId = prompt.MainVersionId ?? throw new AppValidationException("The selected prompt has no main version.");
        }

        var settings = await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        // Only model-choosers may pin a model; a Member falls back to the team default (never stuck).
        var requestedModel = currentUser.CanChooseModel ? req.Model : null;
        var model = !string.IsNullOrWhiteSpace(requestedModel)
            ? requestedModel!.Trim()
            : settings?.DefaultModel ?? GenerationDefaults.FallbackModel;
        var userId = currentUser.UserId ?? string.Empty;
        var name = string.IsNullOrWhiteSpace(req.Name) ? prompt.Name : req.Name!.Trim();

        var variant = new Script
        {
            WorkspaceId = project.WorkspaceId,
            ProjectId = projectId,
            Kind = ScriptKind.Variant,
            Name = name,
            OriginalFileName = string.Empty,
            FileType = FileType.Txt,
            ExtractedText = string.Empty,
            StorageKey = null,
            SourceScriptId = sourceId,
            SourcePromptVersionId = versionId,
            Model = model,
            VariantStatus = SessionStatus.Queued,
            CreatedByUserId = userId,
        };
        db.Scripts.Add(variant);
        await db.SaveChangesAsync(ct);

        // Generation runs in the background; the executor logs the activity (with cost) on completion.
        scheduler.EnqueueVariantGeneration(variant.Id);

        var dir = await users.GetAsync([userId], ct);
        return ScriptService.ToDto(variant, dir);
    }

    public async Task<ScriptProjectDto> PromoteVariantAsync(Guid projectId, Guid variantId, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects.FirstOrDefaultAsync(p => p.Id == projectId, ct)
                      ?? throw new NotFoundException("Project not found.");
        var variant = await db.Scripts.FirstOrDefaultAsync(
            s => s.Id == variantId && s.ProjectId == projectId && s.Kind == ScriptKind.Variant, ct)
            ?? throw new NotFoundException("Variant not found in this project.");

        project.OriginalScriptId = variant.Id;
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.ScriptVariantPromoted,
            TargetType: ActivityTargetType.ScriptProject, TargetId: projectId,
            Summary: $"Promoted a variant of \"{project.Name}\""), ct);

        return (await GetAsync(projectId, ct))!;
    }

    public async Task DeleteVariantAsync(Guid projectId, Guid variantId, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects.FirstOrDefaultAsync(p => p.Id == projectId, ct)
                      ?? throw new NotFoundException("Project not found.");
        var variant = await db.Scripts.FirstOrDefaultAsync(
            s => s.Id == variantId && s.ProjectId == projectId && s.Kind == ScriptKind.Variant, ct)
            ?? throw new NotFoundException("Variant not found in this project.");

        // If the promoted/canonical pointer was this variant, fall back to the uploaded Original.
        if (project.OriginalScriptId == variant.Id)
        {
            var originalId = await db.Scripts
                .Where(s => s.ProjectId == projectId && s.Kind == ScriptKind.Original)
                .Select(s => (Guid?)s.Id)
                .FirstOrDefaultAsync(ct);
            project.OriginalScriptId = originalId;
        }

        db.Scripts.Remove(variant); // cascades the variant's own sessions/canvas
        await db.SaveChangesAsync(ct);
    }

    private static ScriptProjectDto MapProject(
        ScriptProject project, IEnumerable<Script> scripts, IReadOnlyDictionary<string, UserRef> dir)
    {
        var all = scripts.ToList();
        var original = all.FirstOrDefault(s => s.Id == project.OriginalScriptId)
                       ?? all.FirstOrDefault(s => s.Kind == ScriptKind.Original);
        var variants = all
            .Where(s => s.Kind == ScriptKind.Variant)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => ScriptService.ToDto(s, dir))
            .ToList();
        var keywords = all.FirstOrDefault(s => s.Kind == ScriptKind.Keywords);
        // The project's Summary script (the mind-map anchor), if the master Summary has produced one.
        var summary = all.FirstOrDefault(s => s.Kind == ScriptKind.Summary);
        return new ScriptProjectDto(
            project.Id, project.WorkspaceId, project.Name, project.OriginalScriptId, project.SortOrder,
            original is null ? null : ScriptService.ToDto(original, dir), variants,
            keywords is null ? null : ScriptService.ToDto(keywords, dir),
            Attribution.Of(dir, project.CreatedByUserId), project.CreatedAt, project.UpdatedAt,
            summary is null ? null : ScriptService.ToDto(summary, dir));
    }
}
