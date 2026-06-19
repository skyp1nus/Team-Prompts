namespace TeamPrompts.Domain.Entities;

/// <summary>Single-tenant app settings (one row, Id = 1).</summary>
public class AppSettings
{
    public int Id { get; set; } = 1;

    /// <summary>Encrypted OpenRouter API key. Write-only — never returned by any API.</summary>
    public string? OpenRouterApiKeyEncrypted { get; set; }

    public string DefaultModel { get; set; } = "openai/gpt-5";

    /// <summary>JSON array of available model ids (cached from OpenRouter's models endpoint).</summary>
    public string AvailableModels { get; set; } = "[]";

    public DateTimeOffset UpdatedAt { get; set; }
}
