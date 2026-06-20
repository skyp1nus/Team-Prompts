using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
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
    Task SetDefaultModelAsync(string model, CancellationToken ct = default);
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
        return new SettingsDto(!string.IsNullOrEmpty(s.OpenRouterApiKeyEncrypted), s.DefaultModel, ParseModels(s.AvailableModels));
    }

    public async Task SetApiKeyAsync(string apiKey, CancellationToken ct = default)
    {
        var s = await GetRowAsync(ct);
        s.OpenRouterApiKeyEncrypted = protector.Protect(apiKey.Trim());
        await db.SaveChangesAsync(ct);
    }

    public async Task SetDefaultModelAsync(string model, CancellationToken ct = default)
    {
        var s = await GetRowAsync(ct);
        s.DefaultModel = model.Trim();
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<ModelDto>> RefreshModelsAsync(CancellationToken ct = default)
    {
        var models = await openRouter.ListModelsAsync(ct);
        var dtos = models.Select(m => new ModelDto(m.Id, m.Name, m.Description)).ToList();

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
        try
        {
            return JsonSerializer.Deserialize<List<ModelDto>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }
}
