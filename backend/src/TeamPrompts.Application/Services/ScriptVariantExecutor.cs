using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

/// <summary>
/// Generates ONE script-variant as a SINGLE OpenRouter completion and stores the whole streamed text
/// as the variant Script's <c>ExtractedText</c>. Deliberately does NOT split/clean into options the way
/// <see cref="GenerationExecutor"/> does — a variant is one document, not a list of metadata lines.
/// </summary>
public sealed class ScriptVariantExecutor(
    IAppDbContext db,
    IOpenRouterClient openRouter,
    IActivityLogger activity) : IScriptVariantExecutor
{
    private static readonly Regex ScriptToken = new(@"\{\{\s*script\s*\}\}", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public async Task ExecuteAsync(Guid scriptId, CancellationToken ct = default)
    {
        var variant = await db.Scripts.FirstOrDefaultAsync(s => s.Id == scriptId && s.Kind == ScriptKind.Variant, ct);
        if (variant is null) return;

        try
        {
            var sourceText = variant.SourceScriptId is { } srcId
                ? await db.Scripts.AsNoTracking().Where(s => s.Id == srcId)
                    .Select(s => s.ExtractedText).FirstOrDefaultAsync(ct) ?? string.Empty
                : string.Empty;
            var promptContent = variant.SourcePromptVersionId is { } pvId
                ? await db.PromptVersions.AsNoTracking().Where(v => v.Id == pvId)
                    .Select(v => v.Content).FirstOrDefaultAsync(ct) ?? string.Empty
                : string.Empty;

            variant.VariantStatus = SessionStatus.Streaming;
            await db.SaveChangesAsync(ct);

            var messages = BuildMessages(promptContent, sourceText);

            var sb = new StringBuilder();
            decimal? costUsd = null;
            int? promptTokens = null, completionTokens = null, totalTokens = null;
            string? generationId = null;
            var model = variant.Model ?? GenerationDefaults.FallbackModel;
            var request = new OpenRouterChatRequest(model, messages, GenerationDefaults.Temperature);
            await foreach (var ev in openRouter.StreamChatAsync(request, ct))
            {
                switch (ev)
                {
                    case ContentDelta d:
                        sb.Append(d.Text);
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

            variant.ExtractedText = sb.ToString().Trim();
            variant.VariantStatus = SessionStatus.Completed;
            await db.SaveChangesAsync(ct);

            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.ScriptVariantGenerated,
                ActorUserId: variant.CreatedByUserId,
                TargetType: ActivityTargetType.ScriptProject,
                TargetId: variant.ProjectId,
                Summary: $"Generated script-variant \"{variant.Name}\" with {model}",
                Model: model,
                PromptTokens: promptTokens,
                CompletionTokens: completionTokens,
                TotalTokens: totalTokens,
                CostUsd: costUsd,
                Metadata: JsonSerializer.Serialize(new
                {
                    projectId = variant.ProjectId,
                    variantId = variant.Id,
                    sourceScriptId = variant.SourceScriptId,
                    generationId,
                })), CancellationToken.None);
        }
        catch (Exception ex)
        {
            // The variant may have been deleted mid-stream; treat a vanished row as a clean no-op.
            if (!await db.Scripts.AnyAsync(s => s.Id == scriptId, CancellationToken.None))
                return;

            variant.VariantStatus = SessionStatus.Failed;
            variant.VariantError = ex.Message;
            await db.SaveChangesAsync(CancellationToken.None);

            await activity.LogAsync(new ActivityLogEntry(
                ActivityEventType.GenerationFailed,
                ActorUserId: variant.CreatedByUserId,
                TargetType: ActivityTargetType.ScriptProject,
                TargetId: variant.ProjectId,
                Summary: $"Script-variant generation failed for \"{variant.Name}\"",
                Model: variant.Model,
                Metadata: JsonSerializer.Serialize(new { error = ex.Message })), CancellationToken.None);
        }
    }

    /// <summary>
    /// Builds the chat messages. The source script rides the always-on system layer, so the editable
    /// transform prompt stays a pure instruction. A power-user may inline it via a {{script}} token —
    /// then it's substituted there and not duplicated into the system context.
    /// </summary>
    private static List<OpenRouterMessage> BuildMessages(string promptContent, string script)
    {
        var prompt = promptContent ?? string.Empty;
        script ??= string.Empty;

        if (ScriptToken.IsMatch(prompt))
        {
            return
            [
                new("system", GenerationDefaults.ScriptTransformSystem()),
                new("user", ScriptToken.Replace(prompt, script)),
            ];
        }

        var brief = prompt.Trim().Length == 0 ? "Produce the transformed script now." : prompt;
        return
        [
            new("system", $"{GenerationDefaults.ScriptTransformSystem()}\n\n{GenerationDefaults.SourceScriptBlock(script)}"),
            new("user", brief),
        ];
    }
}
