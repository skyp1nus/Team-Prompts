namespace TeamPrompts.Domain.Entities;

/// <summary>
/// Persisted free-form position of one block on a script's generation map ("canvas").
/// Team-wide / shared — everyone sees the same layout. Keyed by a <b>stable node key</b> rather than
/// a session/result id, so a block keeps its place across new runs: a prompt lane is
/// <c>prompt:{promptId}</c> and a model output is <c>col:{promptId}::{model}</c>.
/// </summary>
public class CanvasNode
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ScriptId { get; set; }
    public Script? Script { get; set; }

    /// <summary>Stable identity of the block within the script's canvas (e.g. <c>prompt:{promptId}</c>).</summary>
    public string NodeKey { get; set; } = string.Empty;

    public double X { get; set; }
    public double Y { get; set; }

    public string UpdatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
