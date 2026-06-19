using Hangfire;
using TeamPrompts.Application.Abstractions;

namespace TeamPrompts.Api.Jobs;

public sealed class HangfireJobScheduler : IJobScheduler
{
    public void EnqueueGeneration(Guid sessionId) =>
        BackgroundJob.Enqueue<GenerationJob>(j => j.RunAsync(sessionId, CancellationToken.None));
}
