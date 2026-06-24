using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Domain.Entities;

/// <summary>One generated variant within a session.</summary>
public class GenerationResult
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SessionId { get; set; }
    public GenerationSession? Session { get; set; }

    /// <summary>0-based position within the session.</summary>
    public int Index { get; set; }

    public string Content { get; set; } = string.Empty;

    /// <summary>Optional classification; null when output is freeform.</summary>
    public ResultKind? Kind { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Team-wide "this one is great" mark. Shared (not per-user): anyone toggles it, everyone sees it.</summary>
    public bool IsHighlighted { get; set; }

    /// <summary>Who last set the highlight; null when not highlighted. Attribution only — not an ownership gate.</summary>
    public string? HighlightedByUserId { get; set; }

    /// <summary>When the highlight was last set; null when not highlighted.</summary>
    public DateTimeOffset? HighlightedAt { get; set; }

    public ICollection<ResultFavorite> Favorites { get; set; } = new List<ResultFavorite>();
    public ICollection<ResultCopyEvent> CopyEvents { get; set; } = new List<ResultCopyEvent>();
}
