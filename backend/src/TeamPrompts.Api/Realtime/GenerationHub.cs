using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace TeamPrompts.Api.Realtime;

/// <summary>Clients subscribe per-script (to see all sessions of the active script stream live)
/// and/or per-session. The server pushes status + token deltas + finalized results.</summary>
[Authorize]
public sealed class GenerationHub : Hub
{
    public static string ScriptGroup(Guid scriptId) => $"script:{scriptId}";
    public static string SessionGroup(Guid sessionId) => $"session:{sessionId}";

    public Task SubscribeToScript(Guid scriptId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, ScriptGroup(scriptId));

    public Task UnsubscribeFromScript(Guid scriptId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, ScriptGroup(scriptId));

    public Task SubscribeToSession(Guid sessionId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, SessionGroup(sessionId));

    public Task UnsubscribeFromSession(Guid sessionId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, SessionGroup(sessionId));
}
