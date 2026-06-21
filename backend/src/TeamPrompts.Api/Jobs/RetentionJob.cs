using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Jobs;

/// <summary>Daily Hangfire job — prunes activity events older than the retention window (90 days).</summary>
public sealed class RetentionJob(IActivityService activity)
{
    public const int RetentionDays = 90;

    public Task RunAsync(CancellationToken ct) =>
        activity.PurgeOlderThanAsync(DateTimeOffset.UtcNow.AddDays(-RetentionDays), ct);
}
