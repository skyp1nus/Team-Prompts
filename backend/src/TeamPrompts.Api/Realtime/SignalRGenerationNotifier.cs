using Microsoft.AspNetCore.SignalR;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Dtos;

namespace TeamPrompts.Api.Realtime;

/// <summary>Bridges Application generation events to SignalR groups (per-script + per-session).</summary>
public sealed class SignalRGenerationNotifier(IHubContext<GenerationHub> hub) : IGenerationNotifier
{
    private IClientProxy Targets(Guid scriptId, Guid sessionId) =>
        hub.Clients.Groups(GenerationHub.ScriptGroup(scriptId), GenerationHub.SessionGroup(sessionId));

    public Task SessionStarted(Guid scriptId, SessionDto session, CancellationToken ct = default) =>
        Targets(scriptId, session.Id).SendAsync("SessionStarted", session, ct);

    public Task SessionStatusChanged(Guid scriptId, Guid sessionId, string status, string? error, CancellationToken ct = default) =>
        Targets(scriptId, sessionId).SendAsync("SessionStatusChanged", sessionId, status, error, ct);

    public Task ResultDelta(Guid scriptId, Guid sessionId, int index, string delta, CancellationToken ct = default) =>
        Targets(scriptId, sessionId).SendAsync("ResultDelta", sessionId, index, delta, ct);

    public Task ResultFinalized(Guid scriptId, Guid sessionId, GenerationResultDto result, CancellationToken ct = default) =>
        Targets(scriptId, sessionId).SendAsync("ResultFinalized", sessionId, result, ct);

    public Task SessionCompleted(Guid scriptId, Guid sessionId, CancellationToken ct = default) =>
        Targets(scriptId, sessionId).SendAsync("SessionCompleted", sessionId, ct);
}
