using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

/// <summary>
/// Runs one session as a SINGLE OpenRouter completion that returns N distinct options. The raw
/// text is streamed live, then split + cleaned (markdown/numbering stripped, de-duplicated) into
/// N individual <see cref="GenerationResult"/> rows — one clean, pickable card each.
/// </summary>
public sealed class GenerationExecutor(
    IAppDbContext db,
    IOpenRouterClient openRouter,
    IGenerationNotifier notifier,
    IActivityLogger activity) : IGenerationExecutor
{
    private static readonly Regex ListMarker = new(@"^\s*(\d+[\.\)]|[-*•‣·])\s+", RegexOptions.Compiled);
    private static readonly Regex ScriptToken = new(@"\{\{\s*script\s*\}\}", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public async Task ExecuteAsync(Guid sessionId, CancellationToken ct = default)
    {
        var session = await db.GenerationSessions
            .Include(s => s.Script)
            .Include(s => s.Prompt)
            .Include(s => s.PromptVersion)
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct);
        if (session is null || session.Script is null || session.PromptVersion is null)
            return;

        var promptName = session.Prompt?.Name ?? "prompt";

        var scriptId = session.ScriptId;
        try
        {
            session.Status = SessionStatus.Streaming;
            await db.SaveChangesAsync(ct);
            await notifier.SessionStatusChanged(scriptId, sessionId, nameof(SessionStatus.Streaming), null, ct);

            var messages = BuildMessages(session.PromptVersion.Content, session.Script.ExtractedText);

            // ONE completion. Stream the raw text live into the first slot so the user sees progress.
            var sb = new StringBuilder();
            decimal? costUsd = null;
            int? promptTokens = null, completionTokens = null, totalTokens = null;
            string? generationId = null;
            var request = new OpenRouterChatRequest(session.Model, messages, GenerationDefaults.Temperature);
            await foreach (var ev in openRouter.StreamChatAsync(request, ct))
            {
                switch (ev)
                {
                    case ContentDelta d:
                        sb.Append(d.Text);
                        await notifier.ResultDelta(scriptId, sessionId, 0, d.Text, ct);
                        break;
                    case UsageInfo u:
                        costUsd = u.Cost;
                        promptTokens = u.PromptTokens;
                        completionTokens = u.CompletionTokens;
                        totalTokens = u.TotalTokens;
                        generationId = u.GenerationId;
                        break;
                }
            }

            // Split the response into clean, de-duplicated options — the prompt decides how many,
            // bounded by a safety cap.
            var options = SplitOptions(sb.ToString(), GenerationDefaults.MaxVariantCount);
            if (options.Count == 0)
            {
                var whole = sb.ToString().Trim();
                if (whole.Length > 0) options.Add(whole); // fallback: never lose a non-empty response
            }

            for (var i = 0; i < options.Count; i++)
            {
                var result = new GenerationResult
                {
                    SessionId = sessionId,
                    Index = i,
                    Content = options[i],
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

            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.GenerationCompleted,
                ActorUserId: session.CreatedByUserId,
                TargetType: ActivityTargetType.GenerationSession,
                TargetId: sessionId,
                Summary: $"Generated {options.Count} option{(options.Count == 1 ? "" : "s")} for \"{promptName}\" with {session.Model}",
                Model: session.Model,
                PromptTokens: promptTokens,
                CompletionTokens: completionTokens,
                TotalTokens: totalTokens,
                CostUsd: costUsd,
                Metadata: JsonSerializer.Serialize(new
                {
                    scriptId = session.ScriptId,
                    promptId = session.PromptId,
                    resultCount = options.Count,
                    generationId,
                })), CancellationToken.None);
        }
        catch (Exception ex)
        {
            // The run may have been deleted mid-stream (user removed it from the canvas). In that case
            // our writes FK-fail against the vanished session; treat it as a clean no-op rather than a
            // second exception (a 0-row UPDATE on the deleted, still-tracked session) escaping here.
            if (!await db.GenerationSessions.AnyAsync(s => s.Id == sessionId, CancellationToken.None))
                return;

            session.Status = SessionStatus.Failed;
            session.Error = ex.Message;
            await db.SaveChangesAsync(CancellationToken.None);
            await notifier.SessionStatusChanged(scriptId, sessionId, nameof(SessionStatus.Failed), ex.Message, CancellationToken.None);

            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.GenerationFailed,
                ActorUserId: session.CreatedByUserId,
                TargetType: ActivityTargetType.GenerationSession,
                TargetId: sessionId,
                Summary: $"Generation failed for \"{promptName}\" with {session.Model}",
                Model: session.Model,
                Metadata: JsonSerializer.Serialize(new { error = ex.Message })), CancellationToken.None);
        }
    }

    /// <summary>
    /// Builds the chat messages. The script is supplied by the always-on system layer, so the
    /// editable prompt is a pure brief. A power-user may still place it inline via a {{script}}
    /// token — in that case it is substituted there and NOT duplicated into the system context.
    /// </summary>
    private static List<OpenRouterMessage> BuildMessages(string promptContent, string script)
    {
        var prompt = promptContent ?? string.Empty;
        script ??= string.Empty;

        if (ScriptToken.IsMatch(prompt))
        {
            return
            [
                new("system", GenerationDefaults.SystemGuardrail()),
                new("user", ScriptToken.Replace(prompt, script)),
            ];
        }

        var brief = prompt.Trim().Length == 0 ? "Generate the options now." : prompt;
        return
        [
            new("system", $"{GenerationDefaults.SystemGuardrail()}\n\n{GenerationDefaults.ScriptBlock(script)}"),
            new("user", brief),
        ];
    }

    /// <summary>Splits a completion into clean, plain-text, de-duplicated options (max <paramref name="max"/>).</summary>
    private static List<string> SplitOptions(string raw, int max)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var output = new List<string>();
        foreach (var line in raw.Replace("\r", string.Empty).Split('\n'))
        {
            var cleaned = CleanLine(line);
            if (cleaned.Length == 0) continue;
            if (!seen.Add(cleaned)) continue; // drop exact/case-insensitive repeats
            output.Add(cleaned);
            if (output.Count >= max) break;
        }
        return output;
    }

    /// <summary>Strips list markers, markdown emphasis and wrapping quotes from one line.</summary>
    private static string CleanLine(string line)
    {
        var s = line.Trim();
        if (s.Length == 0) return s;
        s = ListMarker.Replace(s, string.Empty);
        s = s.Replace("**", string.Empty).Replace("__", string.Empty).Replace("`", string.Empty);
        s = s.Trim().Trim('"', '\'', '“', '”', '‘', '’').Trim();
        return s;
    }
}
