using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Abstractions;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

public interface IScriptService
{
    Task<IReadOnlyList<ScriptListItemDto>> ListAsync(string? search, CancellationToken ct = default);
    Task<ScriptDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<ScriptDto> UploadAsync(string fileName, string contentType, Stream content, string? name, CancellationToken ct = default);
    Task<ScriptDto> RenameAsync(Guid id, string name, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class ScriptService(
    IAppDbContext db,
    IFileStorage files,
    ITextExtractor extractor,
    ICurrentUser currentUser,
    IUserDirectory users) : IScriptService
{
    public async Task<IReadOnlyList<ScriptListItemDto>> ListAsync(string? search, CancellationToken ct = default)
    {
        var q = db.Scripts.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            q = q.Where(s => s.Name.ToLower().Contains(term));
        }

        var rows = await q
            .OrderByDescending(s => s.UpdatedAt)
            .Select(s => new
            {
                s.Id, s.Name, s.OriginalFileName, s.FileType, s.CreatedAt, s.UpdatedAt,
                s.CreatedByUserId, SessionCount = s.Sessions.Count,
            })
            .ToListAsync(ct);

        var dir = await users.GetAsync(rows.Select(r => r.CreatedByUserId), ct);
        return rows.Select(r => new ScriptListItemDto(
            r.Id, r.Name, r.OriginalFileName, r.FileType, r.CreatedAt, r.UpdatedAt,
            Attribution.Of(dir, r.CreatedByUserId), r.SessionCount)).ToList();
    }

    public async Task<ScriptDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var s = await db.Scripts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return null;
        var dir = await users.GetAsync([s.CreatedByUserId], ct);
        return new ScriptDto(s.Id, s.Name, s.OriginalFileName, s.FileType, s.ExtractedText,
            s.CreatedAt, s.UpdatedAt, Attribution.Of(dir, s.CreatedByUserId));
    }

    public async Task<ScriptDto> UploadAsync(string fileName, string contentType, Stream content, string? name, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var type = ext switch
        {
            ".pdf" => FileType.Pdf,
            ".txt" => FileType.Txt,
            _ => throw new AppValidationException("Only .pdf and .txt files are supported."),
        };

        // Buffer once: used for both storage (original bytes) and text extraction.
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);

        ms.Position = 0;
        var key = await files.SaveAsync(fileName, contentType, ms, ct);

        ms.Position = 0;
        var text = await extractor.ExtractAsync(type, ms, ct);

        var script = new Script
        {
            Name = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(fileName) : name.Trim(),
            OriginalFileName = fileName,
            FileType = type,
            ExtractedText = text,
            StorageKey = key,
            CreatedByUserId = currentUser.UserId ?? string.Empty,
        };
        db.Scripts.Add(script);
        await db.SaveChangesAsync(ct);

        return (await GetAsync(script.Id, ct))!;
    }

    public async Task<ScriptDto> RenameAsync(Guid id, string name, CancellationToken ct = default)
    {
        var s = await db.Scripts.FirstOrDefaultAsync(x => x.Id == id, ct)
                ?? throw new NotFoundException("Script not found.");
        s.Name = name.Trim();
        await db.SaveChangesAsync(ct);
        return (await GetAsync(id, ct))!;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var s = await db.Scripts.FirstOrDefaultAsync(x => x.Id == id, ct)
                ?? throw new NotFoundException("Script not found.");
        if (s.StorageKey is not null)
            await files.DeleteAsync(s.StorageKey, ct);
        db.Scripts.Remove(s);
        await db.SaveChangesAsync(ct);
    }
}
