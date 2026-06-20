using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Common;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Entities;

namespace TeamPrompts.Application.Services;

/// <summary>Outcome of checking the configured default model id against OpenRouter's live /models list.</summary>
public enum ModelValidationStatus { NoKey, Found, NotFound, Error }

public sealed record ModelValidationResult(ModelValidationStatus Status, string Model, string? Detail);

public interface ISettingsService
{
    Task<SettingsDto> GetAsync(CancellationToken ct = default);
    Task SetApiKeyAsync(string apiKey, CancellationToken ct = default);
    Task DeleteApiKeyAsync(CancellationToken ct = default);
    Task SetFavoriteModelsAsync(IReadOnlyList<string> models, CancellationToken ct = default);
    Task<IReadOnlyList<ModelDto>> RefreshModelsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ModelDto>> GetModelsAsync(CancellationToken ct = default);

    /// <summary>Checks the configured default model id against OpenRouter's /models. Returns NoKey when
    /// no key is set (no network call) and Error when the lookup fails; only a caller cancellation
    /// (OperationCanceledException) propagates, so shutdown isn't reported as a validation error.</summary>
    Task<ModelValidationResult> ValidateDefaultModelAsync(CancellationToken ct = default);
}

public sealed class SettingsService(
    IAppDbContext db,
    ISecretProtector protector,
    IOpenRouterClient openRouter) : ISettingsService
{
    public async Task<SettingsDto> GetAsync(CancellationToken ct = default)
    {
        var s = await GetRowAsync(ct);
        return new SettingsDto(
            !string.IsNullOrEmpty(s.OpenRouterApiKeyEncrypted), s.DefaultModel,
            ParseFavorites(s.FavoriteModels), ParseModels(s.AvailableModels));
    }

    public async Task SetApiKeyAsync(string apiKey, CancellationToken ct = default)
    {
        var s = await GetRowAsync(ct);
        // One key at a time — must be explicitly removed before a different one can be set,
        // so nobody silently overwrites the shared team key.
        if (!string.IsNullOrEmpty(s.OpenRouterApiKeyEncrypted))
            throw new AppValidationException("An API key is already set. Remove it before adding a new one.");
        s.OpenRouterApiKeyEncrypted = protector.Protect(apiKey.Trim());
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteApiKeyAsync(CancellationToken ct = default)
    {
        var s = await GetRowAsync(ct);
        s.OpenRouterApiKeyEncrypted = null;
        await db.SaveChangesAsync(ct);
    }

    public async Task SetFavoriteModelsAsync(IReadOnlyList<string> models, CancellationToken ct = default)
    {
        var clean = (models ?? [])
            .Select(m => m?.Trim() ?? string.Empty)
            .Where(m => m.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var s = await GetRowAsync(ct);
        s.FavoriteModels = JsonSerializer.Serialize(clean);
        if (clean.Count > 0) s.DefaultModel = clean[0]; // first favorite is the generation fallback
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<ModelDto>> RefreshModelsAsync(CancellationToken ct = default)
    {
        var models = await openRouter.ListModelsAsync(ct);
        var dtos = models.Select(m => new ModelDto(m.Id, m.Name, m.Description, m.IsFree)).ToList();

        var s = await GetRowAsync(ct);
        s.AvailableModels = JsonSerializer.Serialize(dtos);
        await db.SaveChangesAsync(ct);
        return dtos;
    }

    public async Task<IReadOnlyList<ModelDto>> GetModelsAsync(CancellationToken ct = default)
    {
        var s = await GetRowAsync(ct);
        return ParseModels(s.AvailableModels);
    }

    public async Task<ModelValidationResult> ValidateDefaultModelAsync(CancellationToken ct = default)
    {
        var s = await GetRowAsync(ct);
        if (string.IsNullOrEmpty(s.OpenRouterApiKeyEncrypted))
            return new ModelValidationResult(ModelValidationStatus.NoKey, s.DefaultModel, null);

        try
        {
            var models = await openRouter.ListModelsAsync(ct);
            var found = models.Any(m => string.Equals(m.Id, s.DefaultModel, StringComparison.OrdinalIgnoreCase));
            return found
                ? new ModelValidationResult(ModelValidationStatus.Found, s.DefaultModel, null)
                : new ModelValidationResult(ModelValidationStatus.NotFound, s.DefaultModel, $"{models.Count} models listed");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return new ModelValidationResult(ModelValidationStatus.Error, s.DefaultModel, ex.Message);
        }
    }

    private async Task<AppSettings> GetRowAsync(CancellationToken ct)
    {
        var s = await db.AppSettings.FirstOrDefaultAsync(ct);
        if (s is null)
        {
            s = new AppSettings { Id = 1 };
            db.AppSettings.Add(s);
            await db.SaveChangesAsync(ct);
        }
        return s;
    }

    private static IReadOnlyList<ModelDto> ParseModels(string json)
    {
        try { return JsonSerializer.Deserialize<List<ModelDto>>(json) ?? []; }
        catch { return []; }
    }

    private static IReadOnlyList<string> ParseFavorites(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; }
        catch { return []; }
    }
}
