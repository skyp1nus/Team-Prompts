using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Infrastructure.Persistence;

namespace TeamPrompts.Infrastructure.OpenRouter;

/// <summary>OpenAI-compatible client for OpenRouter. The API key is read+decrypted from AppSettings per call.</summary>
public sealed class OpenRouterClient(HttpClient http, IHttpClientFactory httpFactory, AppDbContext db, ISecretProtector protector) : IOpenRouterClient
{
    /// <summary>Named client used only for the long-lived streaming completion. It deliberately has
    /// NO standard resilience handler: a total-request timeout or auto-retry would abort or replay a
    /// partially-streamed completion mid-flight. Cancellation is driven by the caller's token.</summary>
    public const string StreamClientName = "openrouter-stream";

    /// <summary>Max idle gap between streamed lines before the stream is treated as stalled. OpenRouter
    /// emits periodic keep-alive comments, so a healthy (even slow) completion resets this on every
    /// line; only a genuinely silent connection trips it. Not a total cap — a long stream runs freely.</summary>
    private static readonly TimeSpan StreamIdleTimeout = TimeSpan.FromSeconds(90);

    public async IAsyncEnumerable<OpenRouterStreamEvent> StreamChatAsync(
        OpenRouterChatRequest request, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var apiKey = await GetApiKeyAsync(ct);

        var payload = new
        {
            model = request.Model,
            messages = request.Messages.Select(m => new { role = m.Role, content = m.Content }),
            stream = true,
            temperature = request.Temperature,
            usage = new { include = true }, // ask OpenRouter to send token+cost usage in the final chunk
        };

        using var msg = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
        {
            Content = JsonContent.Create(payload),
        };
        msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        // Non-resilient streaming client: a total-request timeout or auto-retry would sever or replay a
        // partial SSE completion. We deliberately do NOT auto-retry either — chat/completions is a
        // non-idempotent, billable POST, so re-firing after a connection fault (which may have occurred
        // *after* OpenRouter began a completion) could double-bill. The hang risk is bounded without
        // retry: the handler's ConnectTimeout caps the connect phase, and the per-read idle timeout
        // below caps silent gaps once streaming has started.
        var streamClient = httpFactory.CreateClient(StreamClientName);
        using var resp = await streamClient.SendAsync(msg, HttpCompletionOption.ResponseHeadersRead, ct);
        await EnsureOkAsync(resp, ct);

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        while (true)
        {
            string? line;
            // Reset the idle clock on every line. Keep-alive comments count, so a healthy long
            // generation never trips it, but a silent (stalled) connection does after StreamIdleTimeout.
            using (var idle = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                idle.CancelAfter(StreamIdleTimeout);
                try
                {
                    line = await reader.ReadLineAsync(idle.Token);
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    throw new TimeoutException(
                        $"OpenRouter stream stalled: no data for {StreamIdleTimeout.TotalSeconds:n0}s.");
                }
            }

            if (line is null)
                break;

            if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data:", StringComparison.Ordinal))
                continue;

            var data = line["data:".Length..].Trim();
            if (data == "[DONE]")
                yield break;

            var ev = ParseEvent(data);
            if (ev is not null)
                yield return ev;
        }
    }

    public async Task<IReadOnlyList<OpenRouterModel>> ListModelsAsync(CancellationToken ct = default)
    {
        var apiKey = await GetApiKeyAsync(ct);

        using var msg = new HttpRequestMessage(HttpMethod.Get, "models");
        msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var resp = await http.SendAsync(msg, ct);
        await EnsureOkAsync(resp, ct);

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var list = new List<OpenRouterModel>();
        if (doc.RootElement.TryGetProperty("data", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var m in arr.EnumerateArray())
            {
                var id = m.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrEmpty(id)) continue;
                var name = m.TryGetProperty("name", out var n) ? n.GetString() : null;
                var desc = m.TryGetProperty("description", out var d) ? d.GetString() : null;
                list.Add(new OpenRouterModel(id, name, desc, IsFreeModel(id, m)));
            }
        }
        return list;
    }

    /// <summary>A model is free when its id is suffixed ":free" or its prompt+completion pricing is zero.</summary>
    private static bool IsFreeModel(string id, JsonElement model)
    {
        if (id.EndsWith(":free", StringComparison.OrdinalIgnoreCase)) return true;
        if (!model.TryGetProperty("pricing", out var p) || p.ValueKind != JsonValueKind.Object) return false;
        return IsZero(p, "prompt") && IsZero(p, "completion");

        static bool IsZero(JsonElement pricing, string key) =>
            pricing.TryGetProperty(key, out var v)
            && double.TryParse(v.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var d)
            && d == 0;
    }

    private static OpenRouterStreamEvent? ParseEvent(string data)
    {
        try
        {
            using var doc = JsonDocument.Parse(data);
            var root = doc.RootElement;

            // The terminal usage chunk carries token counts + cost (and no content delta).
            if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
            {
                var id = root.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                return new UsageInfo(
                    id,
                    ReadDecimal(usage, "cost"),
                    ReadInt(usage, "prompt_tokens"),
                    ReadInt(usage, "completion_tokens"),
                    ReadInt(usage, "total_tokens"));
            }

            if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0
                && choices[0].TryGetProperty("delta", out var delta)
                && delta.TryGetProperty("content", out var content)
                && content.ValueKind == JsonValueKind.String)
            {
                var text = content.GetString();
                return string.IsNullOrEmpty(text) ? null : new ContentDelta(text);
            }

            return null;
        }
        catch (JsonException)
        {
            // OpenRouter emits `: OPENROUTER PROCESSING` keep-alive comments — ignore non-JSON lines.
            return null;
        }
    }

    private static decimal ReadDecimal(JsonElement obj, string key) =>
        obj.TryGetProperty(key, out var v)
            ? v.ValueKind switch
            {
                JsonValueKind.Number => v.GetDecimal(),
                JsonValueKind.String when decimal.TryParse(v.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var d) => d,
                _ => 0m,
            }
            : 0m;

    private static int ReadInt(JsonElement obj, string key) =>
        obj.TryGetProperty(key, out var v)
            ? v.ValueKind switch
            {
                JsonValueKind.Number => v.GetInt32(),
                JsonValueKind.String when int.TryParse(v.GetString(), out var i) => i,
                _ => 0,
            }
            : 0;

    private async Task<string> GetApiKeyAsync(CancellationToken ct)
    {
        var enc = await db.AppSettings.AsNoTracking()
            .Select(s => s.OpenRouterApiKeyEncrypted)
            .FirstOrDefaultAsync(ct);

        if (string.IsNullOrEmpty(enc))
            throw new InvalidOperationException("OpenRouter API key is not configured. Set it in Settings.");

        return protector.Unprotect(enc);
    }

    private static async Task EnsureOkAsync(HttpResponseMessage resp, CancellationToken ct)
    {
        if (resp.IsSuccessStatusCode) return;
        var body = await resp.Content.ReadAsStringAsync(ct);
        throw new InvalidOperationException($"OpenRouter request failed ({(int)resp.StatusCode}): {body}");
    }
}
