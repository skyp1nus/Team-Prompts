using TeamPrompts.Application.Abstractions;

namespace TeamPrompts.Api.Jobs;

/// <summary>Hangfire entry point — resolved per job from DI; delegates to the Application executor.</summary>
public sealed class GenerationJob(IGenerationExecutor executor)
{
    public Task RunAsync(Guid sessionId, CancellationToken ct) => executor.ExecuteAsync(sessionId, ct);
}
