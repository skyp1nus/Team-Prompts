using System.Text.Json.Serialization;

namespace TeamPrompts.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FileType
{
    Pdf = 0,
    Txt = 1,
}

/// <summary>Whether a Script is the uploaded source (Original), an AI-generated alternative (Variant),
/// the project's editable keyword list (Keywords) used by keyword-aware prompts, or the auto-generated
/// master-Summary script (Summary) that anchors the mind map and feeds summary-tagged prompts.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ScriptKind
{
    Original = 0,
    Variant = 1,

    /// <summary>The per-project keyword/SEO-term list. One per project, created empty on upload,
    /// edited by the team, and injected into generations whose prompt has UseKeywords=true.</summary>
    Keywords = 2,

    /// <summary>The per-project Summary script (the "mind map" anchor): produced by the workspace's
    /// master Summary prompt from the Original, one per project, and used as the source for any prompt
    /// tagged with <see cref="PromptKind"/>-independent <c>UseSummarySource</c>. Appended last so the
    /// int values of the earlier members never shift.</summary>
    Summary = 3,
}

/// <summary>Whether a Prompt generates the main content from a script (MainScripts — YouTube metadata,
/// options, etc.) or transforms a source script into a new Summary script (Summary — the вижимка the
/// master Summary prompt produces). Scopes which library a prompt shows up in.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PromptKind
{
    MainScripts = 0,
    Summary = 1,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RunStatus
{
    Queued = 0,
    Running = 1,
    Completed = 2,
    Failed = 3,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SessionStatus
{
    Queued = 0,
    Streaming = 1,
    Completed = 2,
    Failed = 3,

    /// <summary>A summary-dependent session that is parked until its Summary script finishes. It is created
    /// up-front (so the node shows immediately) but NOT enqueued; the Summary's executor flips it to
    /// <see cref="Queued"/> on completion. Appended last so existing int values never shift.</summary>
    Waiting = 4,
}

/// <summary>
/// Optional classification of a generation result. Null when the model output is freeform.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ResultKind
{
    Title = 0,
    Description = 1,
    Hook = 2,
    Tags = 3,
    Thumbnail = 4,
}

/// <summary>Kind of action captured in the immutable activity log.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ActivityEventType
{
    UserLoggedIn = 0,
    UserCreated = 1,
    ScriptUploaded = 2,
    ScriptDeleted = 3,
    PromptCreated = 4,
    PromptDeleted = 5,
    PromptVersionCreated = 6,
    PromptVersionPromoted = 7,
    GenerationStarted = 8,
    GenerationCompleted = 9,
    GenerationFailed = 10,
    ResultCopied = 11,
    ResultFavorited = 12,
    ResultUnfavorited = 13,
    GenerationSessionDeleted = 14,
    GenerationRunDeleted = 15,
    ScriptGenerationsCleared = 16,
    ResultHighlighted = 17,
    ResultUnhighlighted = 18,
    ScriptProjectCreated = 19,
    ScriptProjectDeleted = 20,
    ScriptVariantGenerated = 21,
    ScriptVariantPromoted = 22,
}

/// <summary>The entity an activity event points at, for click-through in the feed.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ActivityTargetType
{
    Script = 0,
    Prompt = 1,
    PromptVersion = 2,
    GenerationRun = 3,
    GenerationSession = 4,
    GenerationResult = 5,
    User = 6,
    ScriptProject = 7,
}
