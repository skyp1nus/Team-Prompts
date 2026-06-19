using System.Text;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

/// <summary>Runs one session: streams N variants from OpenRouter, persists each, notifies clients live.</summary>
public sealed class GenerationExecutor(
    IAppDbContext db,
    IOpenRouterClient openRouter,
    IGenerationNotifier notifier) : IGenerationExecutor
{
    public async Task ExecuteAsync(Guid sessionId, CancellationToken ct = default)
    {
        var session = await db.GenerationSessions
            .Include(s => s.Script)
            .Include(s => s.PromptVersion)
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct);
        if (session is null || session.Script is null || session.PromptVersion is null)
            return;

        var scriptId = session.ScriptId;
        try
        {
            session.Status = SessionStatus.Streaming;
            await db.SaveChangesAsync(ct);
            await notifier.SessionStatusChanged(scriptId, sessionId, nameof(SessionStatus.Streaming), null, ct);

            var messages = new List<OpenRouterMessage>
            {
                new("system", session.PromptVersion.Content),
                new("user", $"Video script:\n\n{session.Script.ExtractedText}"),
            };

            for (var i = 0; i < GenerationDefaults.VariantCount; i++)
            {
                ct.ThrowIfCancellationRequested();

                var sb = new StringBuilder();
                var request = new OpenRouterChatRequest(session.Model, messages, GenerationDefaults.Temperature);
                await foreach (var delta in openRouter.StreamChatAsync(request, ct))
                {
                    sb.Append(delta);
                    await notifier.ResultDelta(scriptId, sessionId, i, delta, ct);
                }

                var result = new GenerationResult
                {
                    SessionId = sessionId,
                    Index = i,
                    Content = sb.ToString().Trim(),
                    CreatedAt = DateTimeOffset.UtcNow,
                };
                db.GenerationResults.Add(result);
                await db.SaveChangesAsync(ct);

                await notifier.ResultFinalized(scriptId, sessionId,
                    new GenerationResultDto(result.Id, sessionId, i, result.Content, null, result.CreatedAt, false, 0, 0), ct);
            }

            session.Status = SessionStatus.Completed;
            session.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            await notifier.SessionStatusChanged(scriptId, sessionId, nameof(SessionStatus.Completed), null, ct);
            await notifier.SessionCompleted(scriptId, sessionId, ct);
        }
        catch (Exception ex)
        {
            session.Status = SessionStatus.Failed;
            session.Error = ex.Message;
            await db.SaveChangesAsync(CancellationToken.None);
            await notifier.SessionStatusChanged(scriptId, sessionId, nameof(SessionStatus.Failed), ex.Message, CancellationToken.None);
        }
    }
}
