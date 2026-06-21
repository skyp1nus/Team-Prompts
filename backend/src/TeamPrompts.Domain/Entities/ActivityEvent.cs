using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Domain.Entities;

/// <summary>
/// One immutable, append-only audit record of a user action. Never updated or deleted — the
/// AppDbContext rejects any attempt to modify or remove a persisted ActivityEvent.
/// </summary>
public class ActivityEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public ActivityEventType Type { get; set; }

    /// <summary>Identity user id of who performed the action (null only for system events).</summary>
    public string? ActorUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Denormalized one-line label for the feed (e.g. "Uploaded \"Intro.pdf\"").</summary>
    public string? Summary { get; set; }

    // ---- click-through target (polymorphic, nullable) ----
    public ActivityTargetType? TargetType { get; set; }
    public Guid? TargetId { get; set; }
    public string? TargetUserId { get; set; }

    // ---- spend (populated for GenerationCompleted) ----
    public string? Model { get; set; }
    public int? PromptTokens { get; set; }
    public int? CompletionTokens { get; set; }
    public int? TotalTokens { get; set; }
    public decimal? CostUsd { get; set; }

    /// <summary>JSON blob of type-specific extras (batch counts, old/new name, role, etc.).</summary>
    public string Metadata { get; set; } = "{}";
}
