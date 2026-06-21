using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

public interface IActivityService
{
    Task<ActivityFeedDto> GetFeedAsync(int skip, int take, string? userId, ActivityEventType? type, CancellationToken ct = default);
    Task<UserAggregatesDto> GetUserAggregatesAsync(string userId, CancellationToken ct = default);
}

public sealed class ActivityService(IAppDbContext db, IUserDirectory users) : IActivityService
{
    public async Task<ActivityFeedDto> GetFeedAsync(
        int skip, int take, string? userId, ActivityEventType? type, CancellationToken ct = default)
    {
        take = Math.Clamp(take, 1, 100);
        skip = Math.Max(0, skip);

        var q = db.ActivityEvents.AsNoTracking();
        if (!string.IsNullOrEmpty(userId)) q = q.Where(e => e.ActorUserId == userId);
        if (type is not null) q = q.Where(e => e.Type == type);

        var rows = await q
            .OrderByDescending(e => e.CreatedAt).ThenByDescending(e => e.Id)
            .Skip(skip).Take(take + 1)
            .ToListAsync(ct);

        var hasMore = rows.Count > take;
        if (hasMore) rows = rows.Take(take).ToList();

        var dir = await users.GetAsync(
            rows.Where(r => r.ActorUserId is not null).Select(r => r.ActorUserId!).Distinct(), ct);

        return new ActivityFeedDto(rows.Select(r => Map(r, dir)).ToList(), hasMore);
    }

    public async Task<UserAggregatesDto> GetUserAggregatesAsync(string userId, CancellationToken ct = default)
    {
        var mine = db.ActivityEvents.AsNoTracking().Where(e => e.ActorUserId == userId);
        var completed = mine.Where(e => e.Type == ActivityEventType.GenerationCompleted);

        return new UserAggregatesDto(
            TotalCostUsd: await completed.SumAsync(e => e.CostUsd ?? 0m, ct),
            TotalTokens: await completed.SumAsync(e => e.TotalTokens ?? 0, ct),
            GenerationCount: await completed.CountAsync(ct),
            FailedCount: await mine.CountAsync(e => e.Type == ActivityEventType.GenerationFailed, ct),
            CopyCount: await mine.CountAsync(e => e.Type == ActivityEventType.ResultCopied, ct),
            FavoriteCount: await mine.CountAsync(e => e.Type == ActivityEventType.ResultFavorited, ct),
            LastActiveAt: await mine.OrderByDescending(e => e.CreatedAt)
                .Select(e => (DateTimeOffset?)e.CreatedAt).FirstOrDefaultAsync(ct));
    }

    private static ActivityEventDto Map(ActivityEvent e, IReadOnlyDictionary<string, UserRef> dir) =>
        new(e.Id, e.Type, e.ActorUserId is null ? null : Attribution.Of(dir, e.ActorUserId),
            e.CreatedAt, e.Summary, e.TargetType, e.TargetId, e.TargetUserId,
            e.Model, e.PromptTokens, e.CompletionTokens, e.TotalTokens, e.CostUsd, e.Metadata);
}
