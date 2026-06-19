using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Startup;

/// <summary>
/// On startup, if an OpenRouter API key is configured, confirms the configured default model id exists
/// in the live <c>/models</c> list and logs a clear warning if it doesn't. Runs in the background so it
/// never blocks startup, and swallows all failures into a log line — a missing key or an unreachable
/// OpenRouter must not crash the app.
/// </summary>
public sealed class ModelValidationHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<ModelValidationHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
            var result = await settings.ValidateDefaultModelAsync(stoppingToken);

            switch (result.Status)
            {
                case ModelValidationStatus.NoKey:
                    logger.LogInformation(
                        "OpenRouter model check skipped: no API key configured (set it in Settings). Default model is '{Model}'.",
                        result.Model);
                    break;
                case ModelValidationStatus.Found:
                    logger.LogInformation("OpenRouter default model '{Model}' confirmed against /models.", result.Model);
                    break;
                case ModelValidationStatus.NotFound:
                    logger.LogWarning(
                        "OpenRouter default model '{Model}' was NOT found in the live /models list ({Detail}). Update the default in Settings.",
                        result.Model, result.Detail);
                    break;
                case ModelValidationStatus.Error:
                    logger.LogWarning(
                        "Could not validate OpenRouter default model '{Model}': {Detail}", result.Model, result.Detail);
                    break;
            }
        }
        catch (OperationCanceledException)
        {
            // app is shutting down — nothing to do
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "OpenRouter model validation failed unexpectedly; continuing startup.");
        }
    }
}
