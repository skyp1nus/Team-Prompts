using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Dtos;

// ---- Shared ----
public sealed record UserRef(string Id, string DisplayName, string? Email = null);

// ---- Workspaces (top-level spaces that scope Scripts + Prompt library) ----
public sealed record WorkspaceDto(
    Guid Id, string Name, string? Key, string? AvatarUrl, int SortOrder, bool IsSystem,
    int ScriptCount, int PromptCount, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record CreateWorkspaceRequest(string Name, string? Key);
public sealed record UpdateWorkspaceRequest(string Name, string? Key);

// ---- Auth / users ----
public sealed record LoginRequest(string Email, string Password);
public sealed record CreateUserRequest(string Email, string Password, string DisplayName, string Role);
public sealed record UserDto(string Id, string Email, string DisplayName, IReadOnlyList<string> Roles);

// ---- Scripts ----
public sealed record ScriptListItemDto(
    Guid Id, string Name, string OriginalFileName, FileType FileType,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, UserRef CreatedBy, int SessionCount,
    Guid? ProjectId, ScriptKind Kind);

public sealed record ScriptDto(
    Guid Id, string Name, string OriginalFileName, FileType FileType, string ExtractedText,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, UserRef CreatedBy,
    Guid? ProjectId, ScriptKind Kind, Guid? SourceScriptId, Guid? SourcePromptVersionId,
    string? Model, SessionStatus? VariantStatus, string? VariantError, uint Version);

public sealed record UpdateScriptRequest(string Name);

// ---- Script projects (a "folder": one source Script + its generated variants) ----
public sealed record ScriptProjectListItemDto(
    Guid Id, Guid WorkspaceId, string Name, Guid? OriginalScriptId, int SortOrder,
    int VariantCount, UserRef CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record ScriptProjectDto(
    Guid Id, Guid WorkspaceId, string Name, Guid? OriginalScriptId, int SortOrder,
    ScriptDto? Original, IReadOnlyList<ScriptDto> Variants, ScriptDto? Keywords,
    UserRef CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    // The project's Summary script (the "mind map" anchor) — the master Summary prompt's output over the
    // Original. Null until the first generation kicks it off (or if the workspace has no master Summary).
    ScriptDto? Summary = null);

public sealed record UpdateScriptProjectRequest(string Name);

/// <summary>Replace a project's keyword list (the editable <c>Keywords</c> Script's text). Empty clears it.
/// <c>ExpectedVersion</c> is the <see cref="ScriptDto.Version"/> the client last loaded — when it no longer
/// matches the stored keyword Script the save is rejected with 409 (optimistic concurrency). Null skips the
/// check (e.g. first-time creation of the keyword Script for a legacy project).</summary>
public sealed record UpdateProjectKeywordsRequest(string Content, uint? ExpectedVersion = null);

/// <summary>Generate a new script-variant in a project. <c>PromptVersionId</c> null → the prompt's
/// current main version. The prompt should be a <c>Summary</c> prompt (вижимка / rewrite).</summary>
public sealed record CreateScriptVariantRequest(
    Guid PromptId, Guid? PromptVersionId = null, string? Model = null, string? Name = null);

// ---- Prompts & versions ----
public sealed record PromptListItemDto(
    Guid Id, string Name, Guid? MainVersionId, UserRef CreatedBy,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, int VersionCount, PromptKind Kind, bool UseKeywords,
    bool UseSummarySource,
    // False while the prompt's Main version has no instructions yet (the seeded, empty Tags/Description
    // prompts). The mind map burns such a prompt as "not set up" until the team writes its content.
    bool IsConfigured = true);

public sealed record PromptVersionDto(
    Guid Id, Guid PromptId, Guid? ParentVersionId, string Content,
    UserRef Author, string? Note, bool IsMain, DateTimeOffset CreatedAt);

public sealed record PromptDetailDto(
    Guid Id, string Name, Guid? MainVersionId, UserRef CreatedBy,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyList<PromptVersionDto> Versions,
    PromptKind Kind, bool UseKeywords, bool UseSummarySource, bool IsConfigured = true);

public sealed record CreatePromptRequest(
    Guid WorkspaceId, string Name, string Content, PromptKind Kind = PromptKind.MainScripts,
    bool UseKeywords = false, bool UseSummarySource = false);

/// <summary>Any null field is left unchanged (rename-only).</summary>
public sealed record UpdatePromptRequest(
    string Name, bool? UseKeywords = null, bool? UseSummarySource = null);

/// <summary>Set the team-wide top-to-bottom order of a workspace's prompts. <c>OrderedIds</c> is the
/// full list in the new order; each prompt's <c>SortOrder</c> becomes its index in this list.</summary>
public sealed record ReorderPromptsRequest(Guid WorkspaceId, IReadOnlyList<Guid> OrderedIds);
public sealed record CreateVersionRequest(Guid ParentVersionId, string Content, string? Note);

// ---- Generation ----
/// <summary>One prompt picked for a run. <c>PromptVersionId</c> null → use the prompt's current
/// main version (resolved at run time, so it's always the latest the team promoted).</summary>
public sealed record GenerationPromptInput(Guid PromptId, Guid? PromptVersionId = null);

public sealed record CreateGenerationRequest(
    IReadOnlyList<Guid> ScriptIds, IReadOnlyList<GenerationPromptInput> Prompts, string? Model, int? VariantCount);

public sealed record SessionDto(
    Guid Id, Guid? RunId, Guid ScriptId, Guid PromptId, Guid PromptVersionId,
    string PromptName, string Model, SessionStatus Status, string? Error,
    UserRef CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt,
    int PromptVersionNumber, bool IsMainVersion, string? PromptVersionNote,
    // True when this session ran against a Summary script (a summary-tagged prompt) → the map renders it
    // in the Summary branch rather than a normal prompt lane.
    bool IsSummarySource = false);

public sealed record GenerationResultDto(
    Guid Id, Guid SessionId, int Index, string Content, ResultKind? Kind,
    DateTimeOffset CreatedAt, bool IsFavorite, int FavoriteCount, int CopyCount,
    bool IsHighlighted, UserRef? HighlightedBy, DateTimeOffset? HighlightedAt);

public sealed record SessionWithResultsDto(SessionDto Session, IReadOnlyList<GenerationResultDto> Results);

public sealed record GenerationRunDto(Guid? RunId, IReadOnlyList<SessionDto> Sessions);

/// <summary>Regenerate one session. <c>PromptVersionId</c> null → use the prompt's current main
/// version (so a regen always picks up the latest promoted prompt, never the stale one it started with).</summary>
public sealed record RegenerateRequest(string? Model, Guid? PromptVersionId = null);

// ---- Canvas layout (free-form map block positions, team-wide / shared) ----
/// <summary>One block's position on a script's map. <c>NodeKey</c> is the stable block id
/// (<c>prompt:{promptId}</c> or <c>col:{promptId}::{model}</c>).</summary>
public sealed record CanvasNodeDto(string NodeKey, double X, double Y);

/// <summary>Upsert one or more block positions for a script's canvas (sent on drag end).</summary>
public sealed record SaveCanvasRequest(IReadOnlyList<CanvasNodeDto> Nodes);

/// <summary>An item in the bottom selection tray = a favorited result for the active script.</summary>
public sealed record TrayItemDto(
    Guid ResultId, Guid SessionId, string Content, ResultKind? Kind,
    string PromptName, string Model, DateTimeOffset CreatedAt);

// ---- Settings & models ----
public sealed record ModelDto(string Id, string? Name, string? Description, bool IsFree);
public sealed record SettingsDto(
    bool IsApiKeySet, string DefaultModel,
    IReadOnlyList<string> FavoriteModels, IReadOnlyList<ModelDto> AvailableModels);
public sealed record SetApiKeyRequest(string ApiKey);
public sealed record SetFavoriteModelsRequest(IReadOnlyList<string> Models);

// ---- Activity log & profiles ----
public sealed record ActivityEventDto(
    Guid Id, ActivityEventType Type, UserRef? Actor, DateTimeOffset CreatedAt, string? Summary,
    ActivityTargetType? TargetType, Guid? TargetId, string? TargetUserId,
    string? Model, int? PromptTokens, int? CompletionTokens, int? TotalTokens, decimal? CostUsd,
    string Metadata);

public sealed record ActivityFeedDto(IReadOnlyList<ActivityEventDto> Items, bool HasMore);

public sealed record UserAggregatesDto(
    decimal TotalCostUsd, int TotalTokens, int GenerationCount, int FailedCount,
    int CopyCount, int FavoriteCount, DateTimeOffset? LastActiveAt);

public sealed record UserProfileDto(
    UserRef User, IReadOnlyList<string> Roles, UserAggregatesDto Stats,
    IReadOnlyList<ActivityEventDto> RecentActivity);
