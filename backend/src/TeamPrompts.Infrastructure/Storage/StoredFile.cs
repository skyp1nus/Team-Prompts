namespace TeamPrompts.Infrastructure.Storage;

/// <summary>DB-backed blob row for <see cref="TeamPrompts.Domain.Abstractions.IFileStorage"/>. The swappable seam.</summary>
public class StoredFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public byte[] Content { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
}
