namespace TeamPrompts.Domain.Abstractions;

/// <summary>
/// Storage seam for original uploaded files. The MVP impl persists bytes in Postgres;
/// a blob impl (e.g. MinIO/S3) can replace it later without touching callers.
/// Extracted text is kept separately on <c>Script.ExtractedText</c>.
/// </summary>
public interface IFileStorage
{
    /// <summary>Persists the original file and returns an opaque storage key.</summary>
    Task<string> SaveAsync(string fileName, string contentType, Stream content, CancellationToken ct = default);

    /// <summary>Opens the stored original for reading, or null if the key is unknown.</summary>
    Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default);

    Task DeleteAsync(string key, CancellationToken ct = default);
}
