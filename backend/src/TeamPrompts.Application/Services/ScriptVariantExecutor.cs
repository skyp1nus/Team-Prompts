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
    IActivityLogger activity,
    ISummaryService summaries) : IScriptVariantExecutor
{
    private static readonly Regex ScriptToken = new(@"\{\{\s*script\s*\}\}", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex KeywordsToken = new(@"\{\{\s*keywords\s*\}\}", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public async Task ExecuteAsync(Guid scriptId, CancellationToken ct = default)
    {
        // Both a manual Variant and the auto master-Summary script ride this single-document pipeline
        // (no option-splitting). The Summary script is just a Variant whose Kind marks it as the project's
        // mind-map anchor + the source for summary-tagged prompts.
        var variant = await db.Scripts.FirstOrDefaultAsync(
            s => s.Id == scriptId && (s.Kind == ScriptKind.Variant || s.Kind == ScriptKind.Summary), ct);
        if (variant is null) return;

        try
        {
            var sourceText = variant.SourceScriptId is { } srcId
                ? await db.Scripts.AsNoTracking().Where(s => s.Id == srcId)
                    .Select(s => s.ExtractedText).FirstOrDefaultAsync(ct) ?? string.Empty
                : string.Empty;
            // Pull the prompt content AND its keyword-awareness in one read (the version owns neither —
            // UseKeywords lives on the parent Prompt).
            var promptInfo = variant.SourcePromptVersionId is { } pvId
                ? await db.PromptVersions.AsNoTracking().Where(v => v.Id == pvId)
                    .Select(v => new { v.Content, UseKeywords = v.Prompt!.UseKeywords })
                    .FirstOrDefaultAsync(ct)
                : null;
            var promptContent = promptInfo?.Content ?? string.Empty;
            var useKeywords = promptInfo?.UseKeywords ?? false;
            var keywords = useKeywords && variant.ProjectId is { } pid
                ? await db.Scripts.AsNoTracking()
                    .Where(s => s.ProjectId == pid && s.Kind == ScriptKind.Keywords)
                    .Select(s => s.ExtractedText).FirstOrDefaultAsync(ct)
                : null;

            variant.VariantStatus = SessionStatus.Streaming;
            await db.SaveChangesAsync(ct);

            var messages = BuildMessages(promptContent, sourceText, keywords, useKeywords);

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

            // A Summary just finished → release every prompt parked Waiting on it (run them now).
            if (variant.Kind == ScriptKind.Summary)
                await summaries.DispatchDependentsAsync(variant.Id, CancellationToken.None);
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

            // The Summary failed → don't leave dependents hanging; fail them instead of running on empty text.
            if (variant.Kind == ScriptKind.Summary)
                await summaries.FailDependentsAsync(variant.Id, "The Summary this prompt depends on didn’t finish generating.", CancellationToken.None);
        }
    }

    /// <summary>
    /// Builds the chat messages. The source script rides the always-on system layer, so the editable
    /// transform prompt stays a pure instruction. A power-user may inline it via a {{script}} token —
    /// then it's substituted there and not duplicated into the system context. When the prompt is
    /// keyword-aware, the project keywords replace a {{keywords}} token if present, else ride along
    /// as a keywords block.
    /// </summary>
    private static List<OpenRouterMessage> BuildMessages(string promptContent, string script, string? keywords, bool useKeywords)
    {
        var prompt = promptContent ?? string.Empty;
        script ??= string.Empty;
        var kw = useKeywords ? (keywords ?? string.Empty).Trim() : string.Empty;

        var keywordTokenUsed = useKeywords && KeywordsToken.IsMatch(prompt);
        if (keywordTokenUsed)
            prompt = KeywordsToken.Replace(prompt, kw);

        var scriptInline = ScriptToken.IsMatch(prompt);
        if (scriptInline)
            prompt = ScriptToken.Replace(prompt, script);

        var system = new StringBuilder(GenerationDefaults.SummarySystem());
        if (!scriptInline)
            system.Append("\n\n").Append(GenerationDefaults.SourceScriptBlock(script));
        if (kw.Length > 0 && !keywordTokenUsed)
            system.Append("\n\n").Append(GenerationDefaults.KeywordsBlock(kw));

        var user = prompt.Trim().Length == 0 ? "Produce the transformed script now." : prompt;
        return
        [
            new("system", system.ToString()),
            new("user", user),
        ];
    }
}
