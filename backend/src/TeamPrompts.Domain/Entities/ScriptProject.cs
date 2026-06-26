namespace TeamPrompts.Domain.Entities;

/// <summary>
/// A "project" folder grouping one uploaded source <see cref="Script"/> (the Original) with the
/// AI-generated alternative Scripts (variants / вижимки) derived from it. Workspace-scoped exactly
/// like Script and Prompt; the General space is the reassign target on workspace delete.
/// </summary>
public class ScriptProject
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The workspace this project belongs to (scopes the left Scripts panel).</summary>
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>The canonical source Script (Kind=Original). Promote-a-variant repoints this. Plain
    /// pointer, not an FK — the service keeps it consistent (mirrors the loose end of Prompt.Main).</summary>
    public Guid? OriginalScriptId { get; set; }

    /// <summary>Manual ordering within the workspace — lower comes first. Mirrors Prompt.SortOrder.</summary>
    public int SortOrder { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>The Original plus every generated Variant Script under this project.</summary>
    public ICollection<Script> Scripts { get; set; } = new List<Script>();
}
