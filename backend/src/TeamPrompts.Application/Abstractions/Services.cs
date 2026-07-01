using TeamPrompts.Application.Dtos;

namespace TeamPrompts.Application.Abstractions;

/// <summary>Accessor for the authenticated request user (implemented in the API via HttpContext).</summary>
public interface ICurrentUser
{
    string? UserId { get; }
    string? Email { get; }
    bool IsAuthenticated { get; }
    bool IsAdmin { get; }

    /// <summary>True only for Owner/Admin/PromptEditor. When false (Member), a client-supplied model is
    /// ignored and the server resolves the default — so a Member can never get stuck on an empty pick.</summary>
    bool CanChooseModel { get; }
}

/// <summary>Symmetric protect/unprotect for secrets at rest (Data Protection in Infrastructure).</summary>
public interface ISecretProtector
{
    string Protect(string plaintext);
    string Unprotect(string ciphertext);
}

/// <summary>Resolves user ids to display info for attribution.</summary>
public interface IUserDirectory
{
    Task<IReadOnlyDictionary<string, UserRef>> GetAsync(IEnumerable<string> userIds, CancellationToken ct = default);
}

/// <summary>Enqueues background generation jobs (Hangfire in the API).</summary>
public interface IJobScheduler
{
    void EnqueueGeneration(Guid sessionId);

    /// <summary>Enqueues background generation of one script-variant (a Variant/Summary <c>Script</c> row).</summary>
    void EnqueueVariantGeneration(Guid scriptId);
}

/// <summary>Runs one session end-to-end: stream from OpenRouter, persist results, notify clients.</summary>
public interface IGenerationExecutor
{
    Task ExecuteAsync(Guid sessionId, CancellationToken ct = default);
}

/// <summary>Generates one script-variant: ONE OpenRouter completion, stored whole as the variant
/// Script's ExtractedText (no option-splitting, unlike <see cref="IGenerationExecutor"/>).</summary>
public interface IScriptVariantExecutor
{
    Task ExecuteAsync(Guid scriptId, CancellationToken ct = default);
}

/// <summary>Pushes generation progress to clients (SignalR in the API). Targets per-script + per-session groups.</summary>
public interface IGenerationNotifier
{
    Task SessionStarted(Guid scriptId, SessionDto session, CancellationToken ct = default);
    Task SessionStatusChanged(Guid scriptId, Guid sessionId, string status, string? error, CancellationToken ct = default);
    Task ResultDelta(Guid scriptId, Guid sessionId, int index, string delta, CancellationToken ct = default);
    Task ResultFinalized(Guid scriptId, Guid sessionId, GenerationResultDto result, CancellationToken ct = default);
    Task SessionCompleted(Guid scriptId, Guid sessionId, CancellationToken ct = default);
}
