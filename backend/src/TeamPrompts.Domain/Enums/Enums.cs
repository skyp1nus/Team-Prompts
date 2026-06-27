using System.Text.Json.Serialization;

namespace TeamPrompts.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FileType
{
    Pdf = 0,
    Txt = 1,
}

/// <summary>Whether a Script is the uploaded source (Original), an AI-generated alternative (Variant),
/// or the project's editable keyword list (Keywords) used by keyword-aware prompts.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ScriptKind
{
    Original = 0,
    Variant = 1,

    /// <summary>The per-project keyword/SEO-term list. One per project, created empty on upload,
    /// edited by the team, and injected into generations whose prompt has UseKeywords=true.</summary>
    Keywords = 2,
}

/// <summary>Whether a Prompt generates YouTube metadata or transforms a script into a new variant.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PromptKind
{
    Metadata = 0,
    ScriptTransform = 1,
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
