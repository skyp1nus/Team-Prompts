using System.Text.Json.Serialization;

namespace TeamPrompts.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FileType
{
    Pdf = 0,
    Txt = 1,
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
