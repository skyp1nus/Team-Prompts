using Microsoft.EntityFrameworkCore;
using TeamPrompts.Domain.Abstractions;
using TeamPrompts.Infrastructure.Persistence;

namespace TeamPrompts.Infrastructure.Storage;

/// <summary>MVP <see cref="IFileStorage"/>: stores original file bytes in Postgres. Replaceable with MinIO/S3.</summary>
public sealed class PostgresFileStorage(AppDbContext db) : IFileStorage
{
    public async Task<string> SaveAsync(string fileName, string contentType, Stream content, CancellationToken ct = default)
    {
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);

        var file = new StoredFile
        {
            FileName = fileName,
            ContentType = contentType,
            Content = ms.ToArray(),
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.StoredFiles.Add(file);
        await db.SaveChangesAsync(ct);
        return file.Id.ToString();
    }

    public async Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default)
    {
        if (!Guid.TryParse(key, out var id))
            return null;

        var file = await db.StoredFiles.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id, ct);
        return file is null ? null : new MemoryStream(file.Content);
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        if (!Guid.TryParse(key, out var id))
            return;
        await db.StoredFiles.Where(f => f.Id == id).ExecuteDeleteAsync(ct);
    }
}
