using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Domain.Entities;

/// <summary>A reusable prompt in the team library. Has a Main version plus a tree of branches.</summary>
public class Prompt
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The workspace this prompt belongs to (scopes the right Prompt Library panel).</summary>
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Whether this prompt produces the main content (MainScripts) or is a Summary prompt that
    /// transforms a source script into a new Summary script (a вижимка). Scopes which library it shows in.</summary>
    public PromptKind Kind { get; set; } = PromptKind.MainScripts;

    /// <summary>When true, the active script's project keywords are injected into every generation
    /// run with this prompt — replacing a <c>{{keywords}}</c> token if present, else appended as a
    /// keywords block. Off by default; toggled when the prompt is created.</summary>
    public bool UseKeywords { get; set; }

    /// <summary>The "Summary tag". When true, generations using this prompt run against the project's
    /// <see cref="ScriptKind.Summary"/> script (the master Summary's output) instead of the Original —
    /// so the result lands in the Summary branch on the map. Off by default; the prompt runs against
    /// the Original. Orthogonal to <see cref="Kind"/> — a MainScripts prompt may be summary-tagged.</summary>
    public bool UseSummarySource { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Manual library ordering within the workspace — lower comes first (top). Drives the
    /// top-to-bottom prompt order and, in turn, how prompt lanes + their result columns lay out on
    /// the center map. Reorder is team-wide (shared), like the canvas. Ties fall back to newest-first.</summary>
    public int SortOrder { get; set; }

    /// <summary>The version everyone uses by default. Promote-to-Main repoints this.</summary>
    public Guid? MainVersionId { get; set; }
    public PromptVersion? MainVersion { get; set; }

    public ICollection<PromptVersion> Versions { get; set; } = new List<PromptVersion>();
}
