using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Abstractions;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

/// <summary>The original uploaded file, opened for streaming: raw bytes + the content type/name to
/// serve them under. Carries a live <see cref="Stream"/>, so it is not a serializable DTO.</summary>
public sealed record ScriptFile(Stream Content, string ContentType, string FileName);

public interface IScriptService
{
    /// <summary><paramref name="kind"/> null → Original scripts only (generated variants stay hidden
    /// behind their project folder; the flat rail never lists them).</summary>
    Task<IReadOnlyList<ScriptListItemDto>> ListAsync(Guid? workspaceId, string? search, ScriptKind? kind, CancellationToken ct = default);
    Task<ScriptDto?> GetAsync(Guid id, CancellationToken ct = default);
    /// <summary>Opens the original uploaded file for inline viewing (native browser render), or null if
    /// the script has no stored original (a generated Variant) or the blob is missing.</summary>
    Task<ScriptFile?> OpenOriginalAsync(Guid id, CancellationToken ct = default);
    Task<ScriptDto> UploadAsync(Guid workspaceId, string fileName, string contentType, Stream content, string? name, CancellationToken ct = default);
    Task<ScriptDto> RenameAsync(Guid id, string name, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class ScriptService(
    IAppDbContext db,
    IFileStorage files,
    ITextExtractor extractor,
    ICurrentUser currentUser,
    IUserDirectory users,
    IActivityLogger activity) : IScriptService
{
    public async Task<IReadOnlyList<ScriptListItemDto>> ListAsync(Guid? workspaceId, string? search, ScriptKind? kind, CancellationToken ct = default)
    {
        var q = db.Scripts.AsNoTracking();
        if (workspaceId is { } wsId)
            q = q.Where(s => s.WorkspaceId == wsId);
        // Default to Original-only so generated variants never surface in the flat rail — they live
        // under their project folder. An explicit kind override (e.g. Variant) is still honoured.
        var wanted = kind ?? ScriptKind.Original;
        q = q.Where(s => s.Kind == wanted);
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
                s.CreatedByUserId, SessionCount = s.Sessions.Count, s.ProjectId, s.Kind,
            })
            .ToListAsync(ct);

        var dir = await users.GetAsync(rows.Select(r => r.CreatedByUserId), ct);
        return rows.Select(r => new ScriptListItemDto(
            r.Id, r.Name, r.OriginalFileName, r.FileType, r.CreatedAt, r.UpdatedAt,
            Attribution.Of(dir, r.CreatedByUserId), r.SessionCount, r.ProjectId, r.Kind)).ToList();
    }

    public async Task<ScriptDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var s = await db.Scripts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return null;
        var dir = await users.GetAsync([s.CreatedByUserId], ct);
        return ToDto(s, dir);
    }

    public async Task<ScriptFile?> OpenOriginalAsync(Guid id, CancellationToken ct = default)
    {
        var s = await db.Scripts.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new { x.StorageKey, x.FileType, x.OriginalFileName })
            .FirstOrDefaultAsync(ct);
        if (s?.StorageKey is null) return null;

        var stream = await files.OpenReadAsync(s.StorageKey, ct);
        if (stream is null) return null;

        // Force the content type off the known FileType (not the stored upload type, which can be a
        // generic octet-stream) so the browser reliably renders inline — a PDF with its annotations.
        var contentType = s.FileType switch
        {
            FileType.Pdf => "application/pdf",
            FileType.Txt => "text/plain; charset=utf-8",
            _ => "application/octet-stream",
        };
        return new ScriptFile(stream, contentType, s.OriginalFileName);
    }

    /// <summary>Maps a tracked/untracked Script to its DTO (shared by GetAsync + ScriptProjectService).</summary>
    internal static ScriptDto ToDto(Script s, IReadOnlyDictionary<string, UserRef> dir) =>
        new(s.Id, s.Name, s.OriginalFileName, s.FileType, s.ExtractedText, s.CreatedAt, s.UpdatedAt,
            Attribution.Of(dir, s.CreatedByUserId), s.ProjectId, s.Kind, s.SourceScriptId,
            s.SourcePromptVersionId, s.Model, s.VariantStatus, s.VariantError, s.Version);

    public async Task<ScriptDto> UploadAsync(Guid workspaceId, string fileName, string contentType, Stream content, string? name, CancellationToken ct = default)
    {
        if (!await db.Workspaces.AnyAsync(w => w.Id == workspaceId, ct))
            throw new AppValidationException("Unknown workspace.");

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
            WorkspaceId = workspaceId,
            Name = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(fileName) : name.Trim(),
            OriginalFileName = fileName,
            FileType = type,
            ExtractedText = text,
            StorageKey = key,
            CreatedByUserId = currentUser.UserId ?? string.Empty,
        };
        db.Scripts.Add(script);
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.ScriptUploaded,
            TargetType: ActivityTargetType.Script, TargetId: script.Id,
            Summary: $"Uploaded \"{script.Name}\""), ct);

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
        var name = s.Name;
        db.Scripts.Remove(s);
        await db.SaveChangesAsync(ct);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.ScriptDeleted,
            TargetType: ActivityTargetType.Script, TargetId: id,
            Summary: $"Deleted script \"{name}\""), ct);
    }
}
