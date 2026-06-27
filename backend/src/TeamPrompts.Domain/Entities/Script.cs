using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Domain.Entities;

/// <summary>
/// A video script — the single organizing key of the app. Every generation attaches to one.
/// </summary>
public class Script
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The workspace this script belongs to (scopes the left Scripts panel).</summary>
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }

    public string Name { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public FileType FileType { get; set; }

    /// <summary>Canonical, searchable text. For an Original this is extracted from the upload; for a
    /// Variant it is the AI-generated script body.</summary>
    public string ExtractedText { get; set; } = string.Empty;

    /// <summary>Opaque <see cref="Abstractions.IFileStorage"/> key for the original file (nullable seam).
    /// Null for a generated Variant — it has no uploaded file.</summary>
    public string? StorageKey { get; set; }

    /// <summary>The project folder this script belongs to. Null for ungrouped legacy scripts.</summary>
    public Guid? ProjectId { get; set; }
    public ScriptProject? Project { get; set; }

    /// <summary>Original (uploaded source) vs an AI-generated alternative.</summary>
    public ScriptKind Kind { get; set; } = ScriptKind.Original;

    /// <summary>For a Variant: the Original Script it was derived from. Null for an Original.</summary>
    public Guid? SourceScriptId { get; set; }
    public Script? SourceScript { get; set; }

    /// <summary>For a Variant: the PromptVersion applied to generate it. Provenance only — not an FK,
    /// so deleting the prompt never blocks or cascades into variants.</summary>
    public Guid? SourcePromptVersionId { get; set; }

    /// <summary>For a Variant: the model used to generate it. Null for an Original.</summary>
    public string? Model { get; set; }

    /// <summary>Generation lifecycle for a Variant (Queued → Streaming → Completed/Failed). Null for an
    /// Original (which is created complete on upload).</summary>
    public SessionStatus? VariantStatus { get; set; }

    /// <summary>Failure detail when <see cref="VariantStatus"/> is Failed.</summary>
    public string? VariantError { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>PostgreSQL <c>xmin</c> system column, mapped as an optimistic-concurrency token (see the
    /// Script config in AppDbContext). Bumps on every UPDATE; the frontend echoes the value it last loaded
    /// back on save so a stale edit (e.g. a teammate saved the keywords meanwhile) is rejected with 409
    /// instead of silently overwriting.</summary>
    public uint Version { get; set; }

    public ICollection<GenerationSession> Sessions { get; set; } = new List<GenerationSession>();
}
