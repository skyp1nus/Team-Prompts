namespace TeamPrompts.Domain.Entities;

/// <summary>
/// A workspace ("space") — a top-level container that scopes its own Scripts and Prompt library.
/// Shown as a Mac-dock-style rail on the left. Four map to YouTube channels (keys TT/T/G/B); the
/// system "General" space is the non-deletable catch-all where un-scoped data lands.
/// </summary>
public class Workspace
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;

    /// <summary>Short control letter shown on the dock (e.g. TT, T, G, B). Null for the General space.</summary>
    public string? Key { get; set; }

    /// <summary>Opaque <see cref="Abstractions.IFileStorage"/> key for a custom uploaded avatar (null = none).</summary>
    public string? AvatarStorageKey { get; set; }

    /// <summary>MIME type of the uploaded avatar, so it can be served back with the right Content-Type.</summary>
    public string? AvatarContentType { get; set; }

    /// <summary>Dock ordering — lower comes first. The General space sorts last.</summary>
    public int SortOrder { get; set; }

    /// <summary>System space (General) — cannot be deleted; receives reassigned content on workspace delete.</summary>
    public bool IsSystem { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<Script> Scripts { get; set; } = new List<Script>();
    public ICollection<Prompt> Prompts { get; set; } = new List<Prompt>();
    public ICollection<ScriptProject> Projects { get; set; } = new List<ScriptProject>();
}
