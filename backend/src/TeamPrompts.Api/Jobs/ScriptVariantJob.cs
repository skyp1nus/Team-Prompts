using TeamPrompts.Application.Abstractions;

namespace TeamPrompts.Api.Jobs;

/// <summary>Hangfire entry point for script-variant generation — resolved per job from DI.</summary>
public sealed class ScriptVariantJob(IScriptVariantExecutor executor)
{
    public Task RunAsync(Guid scriptId, CancellationToken ct) => executor.ExecuteAsync(scriptId, ct);
}
