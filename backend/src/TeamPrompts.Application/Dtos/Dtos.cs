using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Dtos;

// ---- Shared ----
public sealed record UserRef(string Id, string DisplayName, string? Email = null);

// ---- Auth / users ----
public sealed record LoginRequest(string Email, string Password);
public sealed record CreateUserRequest(string Email, string Password, string DisplayName, string Role);
public sealed record UserDto(string Id, string Email, string DisplayName, IReadOnlyList<string> Roles);

// ---- Scripts ----
public sealed record ScriptListItemDto(
    Guid Id, string Name, string OriginalFileName, FileType FileType,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, UserRef CreatedBy, int SessionCount);

public sealed record ScriptDto(
    Guid Id, string Name, string OriginalFileName, FileType FileType, string ExtractedText,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, UserRef CreatedBy);

public sealed record UpdateScriptRequest(string Name);

// ---- Prompts & versions ----
public sealed record PromptListItemDto(
    Guid Id, string Name, Guid? MainVersionId, UserRef CreatedBy,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, int VersionCount);

public sealed record PromptVersionDto(
    Guid Id, Guid PromptId, Guid? ParentVersionId, string Content,
    UserRef Author, string? Note, bool IsMain, DateTimeOffset CreatedAt);

public sealed record PromptDetailDto(
    Guid Id, string Name, Guid? MainVersionId, UserRef CreatedBy,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyList<PromptVersionDto> Versions);

public sealed record CreatePromptRequest(string Name, string Content);
public sealed record UpdatePromptRequest(string Name);
public sealed record CreateVersionRequest(Guid ParentVersionId, string Content, string? Note);

// ---- Generation ----
public sealed record CreateGenerationRequest(
    IReadOnlyList<Guid> ScriptIds, IReadOnlyList<Guid> PromptIds, string? Model, int? VariantCount);

public sealed record SessionDto(
    Guid Id, Guid? RunId, Guid ScriptId, Guid PromptId, Guid PromptVersionId,
    string PromptName, string Model, SessionStatus Status, string? Error,
    UserRef CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt);

public sealed record GenerationResultDto(
    Guid Id, Guid SessionId, int Index, string Content, ResultKind? Kind,
    DateTimeOffset CreatedAt, bool IsFavorite, int FavoriteCount, int CopyCount);

public sealed record SessionWithResultsDto(SessionDto Session, IReadOnlyList<GenerationResultDto> Results);

public sealed record GenerationRunDto(Guid? RunId, IReadOnlyList<SessionDto> Sessions);

public sealed record RegenerateRequest(string? Model);

/// <summary>An item in the bottom selection tray = a favorited result for the active script.</summary>
public sealed record TrayItemDto(
    Guid ResultId, Guid SessionId, string Content, ResultKind? Kind,
    string PromptName, string Model, DateTimeOffset CreatedAt);

// ---- Settings & models ----
public sealed record ModelDto(string Id, string? Name, string? Description);
public sealed record SettingsDto(bool IsApiKeySet, string DefaultModel, IReadOnlyList<ModelDto> AvailableModels);
public sealed record SetApiKeyRequest(string ApiKey);
public sealed record SetDefaultModelRequest(string Model);
