using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

/// <summary>
/// Owns the per-project Summary script — the "mind map" anchor. A project's Summary is the workspace's
/// master Summary prompt run over the Original, produced through the single-document variant pipeline
/// (<see cref="IScriptVariantExecutor"/>). There is at most one per project; it is the always-first block
/// on the map and the source any summary-tagged prompt (<see cref="Prompt.UseSummarySource"/>) runs against.
/// </summary>
/// <summary>How to route + time a summary-dependent prompt. <c>SummaryScriptId</c> is what it runs against;
/// <c>IsCompleted</c> → the Summary is ready so run now, else the session is parked <c>Waiting</c> and the
/// Summary's executor releases it on completion.</summary>
public sealed record SummaryPlan(Guid SummaryScriptId, bool IsCompleted);

public interface ISummaryService
{
    /// <summary>Idempotently ensures each given Original's project has a Summary script (auto-run on the
    /// first generation): enqueues one for any project without it whose workspace has a master Summary
    /// prompt. Returns a <see cref="SummaryPlan"/> per Original script id (only those with a project + a
    /// resolvable Summary) so the caller can route + time summary-dependent prompts.</summary>
    Task<IReadOnlyDictionary<Guid, SummaryPlan>> EnsureForScriptsAsync(
        IReadOnlyCollection<Guid> originalScriptIds, string model, CancellationToken ct = default);

    /// <summary>Releases every session parked <c>Waiting</c> on the just-completed Summary script: flips it
    /// to <c>Queued</c> (compare-and-swap, so it's enqueued at most once) and enqueues it. Called by the
    /// Summary's executor on success, and as a race-safety re-check after creating Waiting sessions.</summary>
    Task DispatchDependentsAsync(Guid summaryScriptId, CancellationToken ct = default);

    /// <summary>Fails every session parked <c>Waiting</c> on a Summary that didn't finish, so dependents
    /// never run against empty text.</summary>
    Task FailDependentsAsync(Guid summaryScriptId, string error, CancellationToken ct = default);

    /// <summary>Explicitly (re)generates a project's Summary: resets the existing row in place (keeping its
    /// id so the canvas node survives) or creates one, then re-enqueues. Throws when the workspace has no
    /// master Summary prompt. Returns the queued Summary script.</summary>
    Task<ScriptDto> RegenerateForProjectAsync(Guid projectId, string? model = null, CancellationToken ct = default);
}

public sealed class SummaryService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IUserDirectory users,
    IJobScheduler scheduler) : ISummaryService
{
    public async Task<IReadOnlyDictionary<Guid, SummaryPlan>> EnsureForScriptsAsync(
        IReadOnlyCollection<Guid> originalScriptIds, string model, CancellationToken ct = default)
    {
        var plans = new Dictionary<Guid, SummaryPlan>();
        if (originalScriptIds.Count == 0) return plans;
        var userId = currentUser.UserId ?? string.Empty;

        // Only Originals that already live in a project can anchor a Summary. We deliberately do NOT create
        // projects here — generation must never spawn/duplicate a project (a detached original from a deleted
        // project would otherwise resurrect it). Project-less scripts just fall back to running directly.
        var originals = await db.Scripts.AsNoTracking()
            .Where(s => originalScriptIds.Contains(s.Id) && s.Kind == ScriptKind.Original && s.ProjectId != null)
            .Select(s => new { s.Id, s.WorkspaceId, ProjectId = s.ProjectId!.Value })
            .ToListAsync(ct);
        if (originals.Count == 0) return plans;

        var projectIds = originals.Select(o => o.ProjectId).Distinct().ToList();
        var summaryByProject = (await db.Scripts.AsNoTracking()
                .Where(s => s.Kind == ScriptKind.Summary && s.ProjectId != null && projectIds.Contains(s.ProjectId!.Value))
                .Select(s => new { s.Id, ProjectId = s.ProjectId!.Value, s.VariantStatus })
                .ToListAsync(ct))
            .ToDictionary(s => s.ProjectId);

        // The master Summary is resolved automatically + STABLY — the workspace's OLDEST Summary-kind
        // prompt (by CreatedAt, then Id). One per workspace, always active, and unaffected by reordering
        // or creating newer Summary prompts. No manual flag.
        var workspaceIds = originals.Select(o => o.WorkspaceId).Distinct().ToList();
        var masterVersionByWorkspace = (await db.Prompts.AsNoTracking()
                .Where(p => p.Kind == PromptKind.Summary && p.MainVersionId != null && workspaceIds.Contains(p.WorkspaceId))
                .OrderBy(p => p.CreatedAt).ThenBy(p => p.Id)
                .Select(p => new { p.WorkspaceId, MainVersionId = p.MainVersionId!.Value })
                .ToListAsync(ct))
            .GroupBy(m => m.WorkspaceId)
            .ToDictionary(g => g.Key, g => g.First().MainVersionId);

        // Existing summaries → a plan keyed by their (completed?) state. Missing ones → queue + record.
        var newSummaries = new List<Guid>();
        foreach (var o in originals)
        {
            if (summaryByProject.TryGetValue(o.ProjectId, out var ex))
            {
                plans[o.Id] = new SummaryPlan(ex.Id, ex.VariantStatus == SessionStatus.Completed);
                continue;
            }
            if (!masterVersionByWorkspace.TryGetValue(o.WorkspaceId, out var versionId)) continue; // no master
            var summary = NewSummaryScript(o.WorkspaceId, o.ProjectId, o.Id, versionId, model, userId);
            db.Scripts.Add(summary);
            newSummaries.Add(summary.Id);
            plans[o.Id] = new SummaryPlan(summary.Id, false);
            summaryByProject[o.ProjectId] = new { summary.Id, ProjectId = o.ProjectId, VariantStatus = (SessionStatus?)SessionStatus.Queued };
        }

        if (newSummaries.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            foreach (var id in newSummaries)
                scheduler.EnqueueVariantGeneration(id);
        }

        return plans;
    }

    public async Task DispatchDependentsAsync(Guid summaryScriptId, CancellationToken ct = default)
    {
        var waitingIds = await db.GenerationSessions.AsNoTracking()
            .Where(s => s.ScriptId == summaryScriptId && s.Status == SessionStatus.Waiting)
            .Select(s => s.Id)
            .ToListAsync(ct);
        foreach (var id in waitingIds)
        {
            // Compare-and-swap Waiting→Queued so each session is released + enqueued exactly once even if
            // the executor and the CreateAsync re-check both fire.
            var flipped = await db.GenerationSessions
                .Where(s => s.Id == id && s.Status == SessionStatus.Waiting)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, SessionStatus.Queued), ct);
            if (flipped == 1) scheduler.EnqueueGeneration(id);
        }
    }

    public async Task FailDependentsAsync(Guid summaryScriptId, string error, CancellationToken ct = default)
    {
        await db.GenerationSessions
            .Where(s => s.ScriptId == summaryScriptId && s.Status == SessionStatus.Waiting)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status, SessionStatus.Failed)
                .SetProperty(x => x.Error, error), ct);
    }

    public async Task<ScriptDto> RegenerateForProjectAsync(Guid projectId, string? model = null, CancellationToken ct = default)
    {
        var project = await db.ScriptProjects.AsNoTracking()
            .Where(p => p.Id == projectId)
            .Select(p => new { p.Id, p.WorkspaceId, p.OriginalScriptId })
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Project not found.");
        if (project.OriginalScriptId is not { } originalId)
            throw new AppValidationException("This project has no source script to summarise.");

        // Auto-resolve the master = the workspace's OLDEST Summary-kind prompt (stable across reorder).
        var versionId = await db.Prompts.AsNoTracking()
            .Where(p => p.WorkspaceId == project.WorkspaceId && p.Kind == PromptKind.Summary && p.MainVersionId != null)
            .OrderBy(p => p.CreatedAt).ThenBy(p => p.Id)
            .Select(p => p.MainVersionId)
            .FirstOrDefaultAsync(ct);
        if (versionId is not { } mid)
            throw new AppValidationException(
                "This workspace has no Summary prompt. Create one in the Prompt Library first.");

        var settings = await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var resolvedModel = !string.IsNullOrWhiteSpace(model)
            ? model!.Trim()
            : settings?.DefaultModel ?? GenerationDefaults.FallbackModel;
        var userId = currentUser.UserId ?? string.Empty;

        var existing = await db.Scripts
            .FirstOrDefaultAsync(s => s.ProjectId == projectId && s.Kind == ScriptKind.Summary, ct);
        Script summary;
        if (existing is null)
        {
            summary = NewSummaryScript(project.WorkspaceId, projectId, originalId, mid, resolvedModel, userId);
            db.Scripts.Add(summary);
        }
        else
        {
            // Reset in place so the canvas node keeps its id/position across a regenerate.
            existing.SourceScriptId = originalId;
            existing.SourcePromptVersionId = mid;
            existing.Model = resolvedModel;
            existing.ExtractedText = string.Empty;
            existing.VariantStatus = SessionStatus.Queued;
            existing.VariantError = null;
            summary = existing;
        }
        await db.SaveChangesAsync(ct);
        scheduler.EnqueueVariantGeneration(summary.Id);

        var dir = await users.GetAsync([summary.CreatedByUserId], ct);
        return ScriptService.ToDto(summary, dir);
    }

    /// <summary>Builds a fresh, Queued Summary script row. Shared by ensure + regenerate.</summary>
    private static Script NewSummaryScript(
        Guid workspaceId, Guid projectId, Guid originalId, Guid masterVersionId, string model, string userId) =>
        new()
        {
            WorkspaceId = workspaceId,
            ProjectId = projectId,
            Kind = ScriptKind.Summary,
            Name = "Summary",
            OriginalFileName = string.Empty,
            FileType = FileType.Txt,
            ExtractedText = string.Empty,
            StorageKey = null,
            SourceScriptId = originalId,
            SourcePromptVersionId = masterVersionId,
            Model = model,
            VariantStatus = SessionStatus.Queued,
            CreatedByUserId = userId,
        };
}
