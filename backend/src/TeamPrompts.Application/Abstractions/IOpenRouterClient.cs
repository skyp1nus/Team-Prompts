namespace TeamPrompts.Application.Abstractions;

/// <summary>Thin client over OpenRouter's OpenAI-compatible chat completions + models endpoints.</summary>
public interface IOpenRouterClient
{
    /// <summary>Streams content deltas for one completion. Throws if no API key is configured.</summary>
    IAsyncEnumerable<string> StreamChatAsync(OpenRouterChatRequest request, CancellationToken ct = default);

    Task<IReadOnlyList<OpenRouterModel>> ListModelsAsync(CancellationToken ct = default);
}

public sealed record OpenRouterChatRequest(
    string Model,
    IReadOnlyList<OpenRouterMessage> Messages,
    double? Temperature = null);

public sealed record OpenRouterMessage(string Role, string Content);

public sealed record OpenRouterModel(string Id, string? Name, string? Description);
