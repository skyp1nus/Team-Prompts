using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Abstractions;

/// <summary>Append-only writer for the immutable activity log. Best-effort — never breaks the caller.</summary>
public interface IActivityLogger
{
    Task LogAsync(ActivityLogEntry entry, CancellationToken ct = default);
}

/// <summary>One action to record. ActorUserId null → resolved from the current request user.</summary>
public sealed record ActivityLogEntry(
    ActivityEventType Type,
    string? ActorUserId = null,
    ActivityTargetType? TargetType = null,
    Guid? TargetId = null,
    string? TargetUserId = null,
    string? Summary = null,
    string? Model = null,
    int? PromptTokens = null,
    int? CompletionTokens = null,
    int? TotalTokens = null,
    decimal? CostUsd = null,
    string? Metadata = null);
