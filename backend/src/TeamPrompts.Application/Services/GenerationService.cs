using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

public interface IGenerationService
{
    Task<GenerationRunDto> CreateAsync(CreateGenerationRequest req, CancellationToken ct = default);
    Task<SessionDto> RegenerateAsync(Guid sessionId, string? model, CancellationToken ct = default);
    Task<IReadOnlyList<SessionWithResultsDto>> GetScriptSessionsAsync(Guid scriptId, CancellationToken ct = default);
    Task<SessionWithResultsDto?> GetSessionAsync(Guid sessionId, CancellationToken ct = default);
    Task<bool> ToggleFavoriteAsync(Guid resultId, bool on, CancellationToken ct = default);

    /// <summary>Sets/clears the team-wide highlight on a result. Shared, not per-user. Returns the final state.</summary>
    Task<bool> ToggleHighlightAsync(Guid resultId, bool on, CancellationToken ct = default);

    Task RecordCopyAsync(Guid resultId, CancellationToken ct = default);
    Task<IReadOnlyList<TrayItemDto>> GetTrayAsync(Guid scriptId, CancellationToken ct = default);

    /// <summary>Deletes a single generation run (one session + its results/favorites/copies via cascade).</summary>
    Task DeleteSessionAsync(Guid sessionId, CancellationToken ct = default);

    /// <summary>Deletes a batch run and every session it grouped.</summary>
    Task DeleteRunAsync(Guid runId, CancellationToken ct = default);

    /// <summary>Wipes the whole canvas for a script: every session + result. Returns how many runs were removed.</summary>
    Task<int> ClearScriptSessionsAsync(Guid scriptId, CancellationToken ct = default);
}

public sealed class GenerationService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IUserDirectory users,
    IJobScheduler scheduler,
    IActivityLogger activity,
    ILogger<GenerationService> logger) : IGenerationService
{
    public async Task<GenerationRunDto> CreateAsync(CreateGenerationRequest req, CancellationToken ct = default)
    {
        var scriptIds = req.ScriptIds.Distinct().ToList();
        var promptIds = req.PromptIds.Distinct().ToList();
        if (scriptIds.Count == 0 || promptIds.Count == 0)
            throw new AppValidationException("Select at least one script and one prompt.");

        var foundScripts = await db.Scripts.Where(s => scriptIds.Contains(s.Id)).Select(s => s.Id).ToListAsync(ct);
        if (foundScripts.Count != scriptIds.Count)
            throw new NotFoundException("One or more scripts were not found.");

        var prompts = await db.Prompts.Where(p => promptIds.Contains(p.Id))
            .Select(p => new { p.Id, p.MainVersionId }).ToListAsync(ct);
        if (prompts.Count != promptIds.Count)
            throw new NotFoundException("One or more prompts were not found.");
        if (prompts.Any(p => p.MainVersionId is null))
            throw new AppValidationException("A selected prompt has no main version.");

        var settings = await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var model = !string.IsNullOrWhiteSpace(req.Model)
            ? req.Model!.Trim()
            : settings?.DefaultModel ?? GenerationDefaults.FallbackModel;
        var userId = currentUser.UserId ?? string.Empty;

        GenerationRun? run = null;
        if (scriptIds.Count * promptIds.Count > 1)
        {
            run = new GenerationRun { CreatedByUserId = userId, Status = RunStatus.Running };
            db.GenerationRuns.Add(run);
        }

        var sessions = new List<GenerationSession>();
        foreach (var sid in scriptIds)
        foreach (var p in prompts)
        {
            sessions.Add(new GenerationSession
            {
                RunId = run?.Id,
                ScriptId = sid,
                PromptId = p.Id,
                PromptVersionId = p.MainVersionId!.Value,
                Model = model,
                Status = SessionStatus.Queued,
                CreatedByUserId = userId,
            });
        }
        db.GenerationSessions.AddRange(sessions);
        await db.SaveChangesAsync(ct);

        foreach (var s in sessions)
            scheduler.EnqueueGeneration(s.Id);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.GenerationStarted,
            TargetType: run is not null ? ActivityTargetType.GenerationRun : ActivityTargetType.GenerationSession,
            TargetId: run?.Id ?? sessions[0].Id,
            Summary: $"Started {sessions.Count} generation{(sessions.Count == 1 ? "" : "s")} with {model}",
            Model: model,
            Metadata: JsonSerializer.Serialize(new { scriptIds, promptIds, model, sessionCount = sessions.Count })), ct);

        var dtos = await BuildSessionDtos(sessions.Select(s => s.Id).ToList(), ct);
        return new GenerationRunDto(run?.Id, dtos);
    }

    public async Task<SessionDto> RegenerateAsync(Guid sessionId, string? model, CancellationToken ct = default)
    {
        var existing = await db.GenerationSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId, ct)
                       ?? throw new NotFoundException("Session not found.");

        var session = new GenerationSession
        {
            ScriptId = existing.ScriptId,
            PromptId = existing.PromptId,
            PromptVersionId = existing.PromptVersionId,
            Model = string.IsNullOrWhiteSpace(model) ? existing.Model : model!.Trim(),
            Status = SessionStatus.Queued,
            CreatedByUserId = currentUser.UserId ?? string.Empty,
        };
        db.GenerationSessions.Add(session);
        await db.SaveChangesAsync(ct);

        scheduler.EnqueueGeneration(session.Id);
        return (await BuildSessionDtos([session.Id], ct)).Single();
    }

    public async Task<IReadOnlyList<SessionWithResultsDto>> GetScriptSessionsAsync(Guid scriptId, CancellationToken ct = default)
    {
        var sessions = await db.GenerationSessions.AsNoTracking()
            .Where(s => s.ScriptId == scriptId)
            .Include(s => s.Prompt)
            .Include(s => s.Results).ThenInclude(r => r.Favorites)
            .Include(s => s.Results).ThenInclude(r => r.CopyEvents)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(ct);

        var userIds = sessions.Select(s => s.CreatedByUserId)
            .Concat(sessions.SelectMany(s => s.Results)
                .Where(r => r.HighlightedByUserId is not null)
                .Select(r => r.HighlightedByUserId!))
            .Distinct();
        var dir = await users.GetAsync(userIds, ct);
        var me = currentUser.UserId;
        return sessions.Select(s => new SessionWithResultsDto(
            MapSession(s, dir),
            s.Results.OrderBy(r => r.Index).Select(r => MapResult(r, me, dir)).ToList())).ToList();
    }

    public async Task<SessionWithResultsDto?> GetSessionAsync(Guid sessionId, CancellationToken ct = default)
    {
        var s = await db.GenerationSessions.AsNoTracking()
            .Where(x => x.Id == sessionId)
            .Include(x => x.Prompt)
            .Include(x => x.Results).ThenInclude(r => r.Favorites)
            .Include(x => x.Results).ThenInclude(r => r.CopyEvents)
            .FirstOrDefaultAsync(ct);
        if (s is null) return null;

        var userIds = new[] { s.CreatedByUserId }
            .Concat(s.Results.Where(r => r.HighlightedByUserId is not null).Select(r => r.HighlightedByUserId!))
            .Distinct();
        var dir = await users.GetAsync(userIds, ct);
        var me = currentUser.UserId;
        return new SessionWithResultsDto(MapSession(s, dir),
            s.Results.OrderBy(r => r.Index).Select(r => MapResult(r, me, dir)).ToList());
    }

    public async Task<bool> ToggleFavoriteAsync(Guid resultId, bool on, CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? throw new ForbiddenException("Not authenticated.");
        if (!await db.GenerationResults.AnyAsync(r => r.Id == resultId, ct))
            throw new NotFoundException("Result not found.");

        var fav = await db.ResultFavorites
            .FirstOrDefaultAsync(f => f.GenerationResultId == resultId && f.UserId == userId, ct);

        if (on && fav is null)
        {
            db.ResultFavorites.Add(new ResultFavorite { GenerationResultId = resultId, UserId = userId });
            await db.SaveChangesAsync(ct);
            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.ResultFavorited,
                TargetType: ActivityTargetType.GenerationResult, TargetId: resultId,
                Summary: "Saved a result to the tray"), ct);
        }
        else if (!on && fav is not null)
        {
            db.ResultFavorites.Remove(fav);
            await db.SaveChangesAsync(ct);
            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.ResultUnfavorited,
                TargetType: ActivityTargetType.GenerationResult, TargetId: resultId,
                Summary: "Removed a result from the tray"), ct);
        }
        return on;
    }

    public async Task<bool> ToggleHighlightAsync(Guid resultId, bool on, CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? throw new ForbiddenException("Not authenticated.");
        var result = await db.GenerationResults.FirstOrDefaultAsync(r => r.Id == resultId, ct)
                     ?? throw new NotFoundException("Result not found.");

        if (on && !result.IsHighlighted)
        {
            result.IsHighlighted = true;
            result.HighlightedByUserId = userId;
            result.HighlightedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.ResultHighlighted,
                TargetType: ActivityTargetType.GenerationResult, TargetId: resultId,
                Summary: "Highlighted a result"), ct);
        }
        else if (!on && result.IsHighlighted)
        {
            result.IsHighlighted = false;
            result.HighlightedByUserId = null;
            result.HighlightedAt = null;
            await db.SaveChangesAsync(ct);
            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.ResultUnhighlighted,
                TargetType: ActivityTargetType.GenerationResult, TargetId: resultId,
                Summary: "Cleared a result highlight"), ct);
        }
        return on;
    }

    public async Task RecordCopyAsync(Guid resultId, CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? throw new ForbiddenException("Not authenticated.");
        if (!await db.GenerationResults.AnyAsync(r => r.Id == resultId, ct))
            throw new NotFoundException("Result not found.");

        db.ResultCopyEvents.Add(new ResultCopyEvent { GenerationResultId = resultId, UserId = userId });
        await db.SaveChangesAsync(ct);
        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.ResultCopied,
            TargetType: ActivityTargetType.GenerationResult, TargetId: resultId,
            Summary: "Copied a generated result"), ct);
    }

    public async Task<IReadOnlyList<TrayItemDto>> GetTrayAsync(Guid scriptId, CancellationToken ct = default)
    {
        var userId = currentUser.UserId ?? throw new ForbiddenException("Not authenticated.");
        return await db.ResultFavorites.AsNoTracking()
            .Where(f => f.UserId == userId && f.GenerationResult!.Session!.ScriptId == scriptId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new TrayItemDto(
                f.GenerationResultId,
                f.GenerationResult!.SessionId,
                f.GenerationResult.Content,
                f.GenerationResult.Kind,
                f.GenerationResult.Session!.Prompt!.Name,
                f.GenerationResult.Session.Model,
                f.GenerationResult.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task DeleteSessionAsync(Guid sessionId, CancellationToken ct = default)
    {
        var session = await db.GenerationSessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct)
                      ?? throw new NotFoundException("Generation session not found.");

        var scriptId = session.ScriptId;
        var promptId = session.PromptId;
        var model = session.Model;
        var runId = session.RunId;

        db.GenerationSessions.Remove(session); // DB cascade removes results → favorites/copies
        await db.SaveChangesAsync(ct);

        if (runId is { } rid)
            await RemoveOrphanRunsAsync([rid], ct);

        logger.LogInformation(
            "Deleted generation session {SessionId} (script {ScriptId}, model {Model}) by user {UserId}",
            sessionId, scriptId, model, currentUser.UserId);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.GenerationSessionDeleted,
            TargetType: ActivityTargetType.GenerationSession, TargetId: sessionId,
            Summary: $"Deleted a generation run ({model})",
            Model: model,
            Metadata: JsonSerializer.Serialize(new { scriptId, promptId, runId })), ct);
    }

    public async Task DeleteRunAsync(Guid runId, CancellationToken ct = default)
    {
        var run = await db.GenerationRuns
            .Include(r => r.Sessions)
            .FirstOrDefaultAsync(r => r.Id == runId, ct)
            ?? throw new NotFoundException("Run not found.");

        var sessionCount = run.Sessions.Count;
        if (sessionCount > 0)
            db.GenerationSessions.RemoveRange(run.Sessions); // DB cascade removes results
        db.GenerationRuns.Remove(run);
        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Deleted generation run {RunId} with {SessionCount} session(s) by user {UserId}",
            runId, sessionCount, currentUser.UserId);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.GenerationRunDeleted,
            TargetType: ActivityTargetType.GenerationRun, TargetId: runId,
            Summary: $"Deleted a batch run ({sessionCount} generation{(sessionCount == 1 ? "" : "s")})",
            Metadata: JsonSerializer.Serialize(new { runId, sessionCount })), ct);
    }

    public async Task<int> ClearScriptSessionsAsync(Guid scriptId, CancellationToken ct = default)
    {
        if (!await db.Scripts.AnyAsync(s => s.Id == scriptId, ct))
            throw new NotFoundException("Script not found.");

        var sessions = await db.GenerationSessions.Where(s => s.ScriptId == scriptId).ToListAsync(ct);
        var count = sessions.Count;
        var runIds = sessions.Where(s => s.RunId is not null).Select(s => s.RunId!.Value).Distinct().ToList();

        if (count > 0)
        {
            db.GenerationSessions.RemoveRange(sessions); // DB cascade removes results → favorites/copies
            await db.SaveChangesAsync(ct);
            await RemoveOrphanRunsAsync(runIds, ct);
        }

        logger.LogInformation(
            "Cleared {Count} generation session(s) for script {ScriptId} by user {UserId}",
            count, scriptId, currentUser.UserId);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.ScriptGenerationsCleared,
            TargetType: ActivityTargetType.Script, TargetId: scriptId,
            Summary: $"Cleared the generation canvas ({count} run{(count == 1 ? "" : "s")})",
            Metadata: JsonSerializer.Serialize(new { scriptId, sessionCount = count })), ct);

        return count;
    }

    /// <summary>Removes any of the given batch runs left with no sessions after a deletion — keeps the table tidy.</summary>
    private async Task RemoveOrphanRunsAsync(IReadOnlyCollection<Guid> runIds, CancellationToken ct)
    {
        if (runIds.Count == 0) return;
        var orphans = await db.GenerationRuns
            .Where(r => runIds.Contains(r.Id) && !r.Sessions.Any())
            .ToListAsync(ct);
        if (orphans.Count == 0) return;
        db.GenerationRuns.RemoveRange(orphans);
        await db.SaveChangesAsync(ct);
    }

    private async Task<IReadOnlyList<SessionDto>> BuildSessionDtos(List<Guid> ids, CancellationToken ct)
    {
        var sessions = await db.GenerationSessions.AsNoTracking()
            .Where(s => ids.Contains(s.Id))
            .Include(s => s.Prompt)
            .ToListAsync(ct);
        var dir = await users.GetAsync(sessions.Select(s => s.CreatedByUserId).Distinct(), ct);
        return sessions
            .OrderBy(s => ids.IndexOf(s.Id))
            .Select(s => MapSession(s, dir))
            .ToList();
    }

    private static SessionDto MapSession(GenerationSession s, IReadOnlyDictionary<string, UserRef> dir) =>
        new(s.Id, s.RunId, s.ScriptId, s.PromptId, s.PromptVersionId, s.Prompt?.Name ?? string.Empty,
            s.Model, s.Status, s.Error, Attribution.Of(dir, s.CreatedByUserId), s.CreatedAt, s.CompletedAt);

    private static GenerationResultDto MapResult(GenerationResult r, string? me, IReadOnlyDictionary<string, UserRef> dir) =>
        new(r.Id, r.SessionId, r.Index, r.Content, r.Kind, r.CreatedAt,
            me is not null && r.Favorites.Any(f => f.UserId == me), r.Favorites.Count, r.CopyEvents.Count,
            r.IsHighlighted,
            r.HighlightedByUserId is { } hid ? Attribution.Of(dir, hid) : null,
            r.HighlightedAt);
}
