using Microsoft.EntityFrameworkCore;
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
    Task RecordCopyAsync(Guid resultId, CancellationToken ct = default);
    Task<IReadOnlyList<TrayItemDto>> GetTrayAsync(Guid scriptId, CancellationToken ct = default);
}

public sealed class GenerationService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IUserDirectory users,
    IJobScheduler scheduler) : IGenerationService
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

        var dir = await users.GetAsync(sessions.Select(s => s.CreatedByUserId).Distinct(), ct);
        var me = currentUser.UserId;
        return sessions.Select(s => new SessionWithResultsDto(
            MapSession(s, dir),
            s.Results.OrderBy(r => r.Index).Select(r => MapResult(r, me)).ToList())).ToList();
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

        var dir = await users.GetAsync([s.CreatedByUserId], ct);
        var me = currentUser.UserId;
        return new SessionWithResultsDto(MapSession(s, dir),
            s.Results.OrderBy(r => r.Index).Select(r => MapResult(r, me)).ToList());
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
        }
        else if (!on && fav is not null)
        {
            db.ResultFavorites.Remove(fav);
            await db.SaveChangesAsync(ct);
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

    private static GenerationResultDto MapResult(GenerationResult r, string? me) =>
        new(r.Id, r.SessionId, r.Index, r.Content, r.Kind, r.CreatedAt,
            me is not null && r.Favorites.Any(f => f.UserId == me), r.Favorites.Count, r.CopyEvents.Count);
}
