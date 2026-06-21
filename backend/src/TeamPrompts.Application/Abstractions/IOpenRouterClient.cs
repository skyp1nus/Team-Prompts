namespace TeamPrompts.Application.Abstractions;

/// <summary>Thin client over OpenRouter's OpenAI-compatible chat completions + models endpoints.</summary>
public interface IOpenRouterClient
{
    /// <summary>
    /// Streams a completion. Yields a <see cref="ContentDelta"/> per token and a terminal
    /// <see cref="UsageInfo"/> (tokens + USD cost) just before the stream ends. Throws if no key set.
    /// </summary>
    IAsyncEnumerable<OpenRouterStreamEvent> StreamChatAsync(OpenRouterChatRequest request, CancellationToken ct = default);

    Task<IReadOnlyList<OpenRouterModel>> ListModelsAsync(CancellationToken ct = default);
}

public sealed record OpenRouterChatRequest(
    string Model,
    IReadOnlyList<OpenRouterMessage> Messages,
    double? Temperature = null);

public sealed record OpenRouterMessage(string Role, string Content);

public sealed record OpenRouterModel(string Id, string? Name, string? Description, bool IsFree);

/// <summary>An item streamed from a chat completion: either a content token or terminal usage/cost.</summary>
public abstract record OpenRouterStreamEvent;

public sealed record ContentDelta(string Text) : OpenRouterStreamEvent;

/// <summary>Terminal usage record. Cost is in USD (OpenRouter credits map 1:1 to USD).</summary>
public sealed record UsageInfo(
    string? GenerationId, decimal Cost, int PromptTokens, int CompletionTokens, int TotalTokens) : OpenRouterStreamEvent;
