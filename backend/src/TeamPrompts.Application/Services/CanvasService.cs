using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;

namespace TeamPrompts.Application.Services;

/// <summary>
/// Free-form layout of a script's generation map. Positions are <b>team-wide</b> (shared, like the
/// rest of the canvas) and keyed by a stable block id, so a block keeps its place across new runs.
/// </summary>
public interface ICanvasService
{
    /// <summary>Every saved block position for a script (empty when the layout is still auto).</summary>
    Task<IReadOnlyList<CanvasNodeDto>> GetAsync(Guid scriptId, CancellationToken ct = default);

    /// <summary>Upserts the given block positions for a script. Unknown keys are inserted, known keys moved.</summary>
    Task SaveAsync(Guid scriptId, IReadOnlyList<CanvasNodeDto> nodes, CancellationToken ct = default);

    /// <summary>Clears every saved position for a script — the map falls back to auto-layout.</summary>
    Task ResetAsync(Guid scriptId, CancellationToken ct = default);
}

public sealed class CanvasService(IAppDbContext db, ICurrentUser currentUser) : ICanvasService
{
    /// <summary>Guards against NaN/Infinity and runaway coordinates from a buggy client.</summary>
    private const double Limit = 100_000;
    private const int MaxNodeKeyLength = 200;

    public async Task<IReadOnlyList<CanvasNodeDto>> GetAsync(Guid scriptId, CancellationToken ct = default)
        => await db.CanvasNodes.AsNoTracking()
            .Where(c => c.ScriptId == scriptId)
            .Select(c => new CanvasNodeDto(c.NodeKey, c.X, c.Y))
            .ToListAsync(ct);

    public async Task SaveAsync(Guid scriptId, IReadOnlyList<CanvasNodeDto> nodes, CancellationToken ct = default)
    {
        // Sanitise + dedupe by key (last write wins) before touching the DB.
        var incoming = nodes
            .Where(n => !string.IsNullOrWhiteSpace(n.NodeKey))
            .GroupBy(n => Key(n.NodeKey))
            .ToDictionary(g => g.Key, g => (X: Clamp(g.Last().X), Y: Clamp(g.Last().Y)));
        if (incoming.Count == 0) return;

        if (!await db.Scripts.AnyAsync(s => s.Id == scriptId, ct))
            throw new NotFoundException("Script not found.");

        var userId = currentUser.UserId ?? string.Empty;
        var keys = incoming.Keys.ToList();

        // Upsert with a single retry. Positions are shared, so two teammates dragging the same
        // never-positioned block at once can both take the INSERT branch and collide on the unique
        // (ScriptId, NodeKey) index. On conflict we drop the losing inserts, reload (the winner's
        // row now exists) and re-apply as updates — last write wins, no 500.
        for (var attempt = 0; ; attempt++)
        {
            var existing = await db.CanvasNodes
                .Where(c => c.ScriptId == scriptId && keys.Contains(c.NodeKey))
                .ToListAsync(ct);
            var byKey = existing.ToDictionary(c => c.NodeKey);
            var inserted = new List<CanvasNode>();

            foreach (var (key, pos) in incoming)
            {
                if (byKey.TryGetValue(key, out var node))
                {
                    node.X = pos.X;
                    node.Y = pos.Y;
                    node.UpdatedByUserId = userId;
                }
                else
                {
                    var fresh = new CanvasNode
                    {
                        ScriptId = scriptId,
                        NodeKey = key,
                        X = pos.X,
                        Y = pos.Y,
                        UpdatedByUserId = userId,
                    };
                    db.CanvasNodes.Add(fresh);
                    inserted.Add(fresh);
                }
            }

            try
            {
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateException) when (attempt == 0)
            {
                // Detach the inserts that lost the race; the retry re-reads them as updates.
                foreach (var node in inserted)
                    db.CanvasNodes.Remove(node);
            }
        }
    }

    public async Task ResetAsync(Guid scriptId, CancellationToken ct = default)
    {
        var nodes = await db.CanvasNodes.Where(c => c.ScriptId == scriptId).ToListAsync(ct);
        if (nodes.Count == 0) return;
        db.CanvasNodes.RemoveRange(nodes);
        await db.SaveChangesAsync(ct);
    }

    private static string Key(string raw)
    {
        var k = raw.Trim();
        return k.Length > MaxNodeKeyLength ? k[..MaxNodeKeyLength] : k;
    }

    private static double Clamp(double v) => double.IsFinite(v) ? Math.Clamp(v, -Limit, Limit) : 0;
}
