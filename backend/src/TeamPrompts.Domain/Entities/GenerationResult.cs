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

    public ICollection<ResultFavorite> Favorites { get; set; } = new List<ResultFavorite>();
    public ICollection<ResultCopyEvent> CopyEvents { get; set; } = new List<ResultCopyEvent>();
}
