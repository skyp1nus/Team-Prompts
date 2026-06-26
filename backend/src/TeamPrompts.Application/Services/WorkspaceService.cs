using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Abstractions;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

/// <summary>An avatar payload streamed back to the client with its stored MIME type.</summary>
public sealed record AvatarFile(Stream Content, string ContentType);

public interface IWorkspaceService
{
    Task<IReadOnlyList<WorkspaceDto>> ListAsync(CancellationToken ct = default);
    Task<WorkspaceDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<WorkspaceDto> CreateAsync(CreateWorkspaceRequest req, CancellationToken ct = default);
    Task<WorkspaceDto> UpdateAsync(Guid id, UpdateWorkspaceRequest req, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
    Task<WorkspaceDto> SetAvatarAsync(Guid id, string fileName, string contentType, Stream content, CancellationToken ct = default);
    Task<AvatarFile?> GetAvatarAsync(Guid id, CancellationToken ct = default);
}

public sealed class WorkspaceService(
    IAppDbContext db,
    IFileStorage files,
    ICurrentUser currentUser) : IWorkspaceService
{
    // Raster only — image/svg+xml is deliberately excluded (an SVG avatar served inline is a stored-XSS vector).
    private static readonly HashSet<string> AllowedAvatarTypes =
        new(StringComparer.OrdinalIgnoreCase) { "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif" };

    public async Task<IReadOnlyList<WorkspaceDto>> ListAsync(CancellationToken ct = default)
    {
        var rows = await db.Workspaces.AsNoTracking()
            .OrderBy(w => w.SortOrder).ThenBy(w => w.Name)
            .Select(w => new
            {
                w.Id, w.Name, w.Key, w.AvatarStorageKey, w.SortOrder, w.IsSystem,
                w.CreatedAt, w.UpdatedAt,
                ScriptCount = w.Scripts.Count(s => s.Kind == ScriptKind.Original), PromptCount = w.Prompts.Count,
            })
            .ToListAsync(ct);

        return rows.Select(w => new WorkspaceDto(
            w.Id, w.Name, w.Key, AvatarUrl(w.Id, w.AvatarStorageKey), w.SortOrder, w.IsSystem,
            w.ScriptCount, w.PromptCount, w.CreatedAt, w.UpdatedAt)).ToList();
    }

    public async Task<WorkspaceDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var w = await db.Workspaces.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id, x.Name, x.Key, x.AvatarStorageKey, x.SortOrder, x.IsSystem,
                x.CreatedAt, x.UpdatedAt,
                ScriptCount = x.Scripts.Count(s => s.Kind == ScriptKind.Original), PromptCount = x.Prompts.Count,
            })
            .FirstOrDefaultAsync(ct);
        if (w is null) return null;
        return new WorkspaceDto(w.Id, w.Name, w.Key, AvatarUrl(w.Id, w.AvatarStorageKey), w.SortOrder,
            w.IsSystem, w.ScriptCount, w.PromptCount, w.CreatedAt, w.UpdatedAt);
    }

    public async Task<WorkspaceDto> CreateAsync(CreateWorkspaceRequest req, CancellationToken ct = default)
    {
        // Exclude the General sentinel (SortOrder 100) so new spaces sort before it, not above it.
        var maxOrder = await db.Workspaces
            .Where(w => !w.IsSystem)
            .Select(w => (int?)w.SortOrder)
            .MaxAsync(ct) ?? 0;

        var ws = new Workspace
        {
            Name = req.Name.Trim(),
            Key = string.IsNullOrWhiteSpace(req.Key) ? null : req.Key.Trim(),
            // New spaces sort after every existing one but still before the General catch-all.
            SortOrder = maxOrder + 1,
            IsSystem = false,
            CreatedByUserId = currentUser.UserId ?? string.Empty,
        };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync(ct);
        return (await GetAsync(ws.Id, ct))!;
    }

    public async Task<WorkspaceDto> UpdateAsync(Guid id, UpdateWorkspaceRequest req, CancellationToken ct = default)
    {
        var ws = await db.Workspaces.FirstOrDefaultAsync(w => w.Id == id, ct)
                 ?? throw new NotFoundException("Workspace not found.");
        ws.Name = req.Name.Trim();
        ws.Key = string.IsNullOrWhiteSpace(req.Key) ? null : req.Key.Trim();
        await db.SaveChangesAsync(ct);
        return (await GetAsync(id, ct))!;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var ws = await db.Workspaces.FirstOrDefaultAsync(w => w.Id == id, ct)
                 ?? throw new NotFoundException("Workspace not found.");
        if (ws.IsSystem)
            throw new AppValidationException("The General workspace cannot be deleted.");

        var general = WorkspaceDefaults.GeneralId;
        var avatarKey = ws.AvatarStorageKey;

        // Reassign content to General rather than cascade-deleting it (FK is Restrict). Both updates +
        // the removal commit as one unit so a mid-way failure can't leave content half-moved.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Scripts.Where(s => s.WorkspaceId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.WorkspaceId, general), ct);
        await db.Prompts.Where(p => p.WorkspaceId == id)
            .ExecuteUpdateAsync(p => p.SetProperty(x => x.WorkspaceId, general), ct);
        // Projects are Restrict-FK'd to the workspace too — reassign them or the remove below throws.
        await db.ScriptProjects.Where(p => p.WorkspaceId == id)
            .ExecuteUpdateAsync(p => p.SetProperty(x => x.WorkspaceId, general), ct);
        db.Workspaces.Remove(ws);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Drop the avatar blob only after the row is gone for good — a rollback then leaves it referenced.
        if (avatarKey is not null)
            await files.DeleteAsync(avatarKey, ct);
    }

    public async Task<WorkspaceDto> SetAvatarAsync(Guid id, string fileName, string contentType, Stream content, CancellationToken ct = default)
    {
        if (!AllowedAvatarTypes.Contains(contentType))
            throw new AppValidationException("Avatar must be a PNG, JPEG, WebP or GIF image.");

        var ws = await db.Workspaces.FirstOrDefaultAsync(w => w.Id == id, ct)
                 ?? throw new NotFoundException("Workspace not found.");

        var oldKey = ws.AvatarStorageKey;
        var newKey = await files.SaveAsync(fileName, contentType, content, ct);
        ws.AvatarStorageKey = newKey;
        ws.AvatarContentType = contentType;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            // Don't orphan the blob we just stored if persisting the new key fails.
            await files.DeleteAsync(newKey, ct);
            throw;
        }

        if (oldKey is not null)
            await files.DeleteAsync(oldKey, ct);

        return (await GetAsync(id, ct))!;
    }

    public async Task<AvatarFile?> GetAvatarAsync(Guid id, CancellationToken ct = default)
    {
        var ws = await db.Workspaces.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id, ct);
        if (ws?.AvatarStorageKey is null) return null;
        var stream = await files.OpenReadAsync(ws.AvatarStorageKey, ct);
        return stream is null ? null : new AvatarFile(stream, ws.AvatarContentType ?? "application/octet-stream");
    }

    /// <summary>Custom avatars are served through the API; seeded channel avatars use static FE assets (no URL here).</summary>
    private static string? AvatarUrl(Guid id, string? storageKey)
        => storageKey is null ? null : $"/api/workspaces/{id}/avatar";
}
