using Microsoft.Extensions.Logging;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Domain.Entities;

namespace TeamPrompts.Application.Services;

/// <summary>Writes append-only activity events. Best-effort: an audit failure never breaks the action.</summary>
public sealed class ActivityLogger(IAppDbContext db, ICurrentUser currentUser, ILogger<ActivityLogger> logger)
    : IActivityLogger
{
    public async Task LogAsync(ActivityLogEntry entry, CancellationToken ct = default)
    {
        try
        {
            db.ActivityEvents.Add(new ActivityEvent
            {
                Type = entry.Type,
                ActorUserId = entry.ActorUserId ?? currentUser.UserId,
                Summary = entry.Summary,
                TargetType = entry.TargetType,
                TargetId = entry.TargetId,
                TargetUserId = entry.TargetUserId,
                Model = entry.Model,
                PromptTokens = entry.PromptTokens,
                CompletionTokens = entry.CompletionTokens,
                TotalTokens = entry.TotalTokens,
                CostUsd = entry.CostUsd,
                Metadata = entry.Metadata ?? "{}",
            });
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to write activity event {Type}", entry.Type);
        }
    }
}
