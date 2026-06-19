using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Domain.Entities;

/// <summary>
/// A video script — the single organizing key of the app. Every generation attaches to one.
/// </summary>
public class Script
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public FileType FileType { get; set; }

    /// <summary>Canonical, searchable text extracted from the upload.</summary>
    public string ExtractedText { get; set; } = string.Empty;

    /// <summary>Opaque <see cref="Abstractions.IFileStorage"/> key for the original file (nullable seam).</summary>
    public string? StorageKey { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<GenerationSession> Sessions { get; set; } = new List<GenerationSession>();
}
