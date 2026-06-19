using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Domain.Abstractions;
using TeamPrompts.Infrastructure.Identity;
using TeamPrompts.Infrastructure.OpenRouter;
using TeamPrompts.Infrastructure.Persistence;
using TeamPrompts.Infrastructure.Security;
using TeamPrompts.Infrastructure.Storage;
using TeamPrompts.Infrastructure.Text;

namespace TeamPrompts.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Registers EF Core (Npgsql), file storage, text extraction, user directory,
    /// secret protection and the resilient OpenRouter client. Identity/auth is wired in the API.</summary>
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, string connectionString, string openRouterBaseUrl)
    {
        services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddScoped<IFileStorage, PostgresFileStorage>();
        services.AddSingleton<ITextExtractor, PdfTextExtractor>();
        services.AddScoped<IUserDirectory, UserDirectory>();
        services.AddSingleton<ISecretProtector, DataProtectionSecretProtector>();

        var baseUrl = openRouterBaseUrl.EndsWith('/') ? openRouterBaseUrl : openRouterBaseUrl + "/";
        void ConfigureClient(HttpClient c)
        {
            c.BaseAddress = new Uri(baseUrl);
            c.DefaultRequestHeaders.Add("X-Title", "Team Prompts");
        }

        // Resilient client for short, non-streaming calls (e.g. /models). Retry + circuit breaker +
        // bounded timeouts are correct here. The streaming completion does NOT use this client.
        services.AddHttpClient<IOpenRouterClient, OpenRouterClient>(c =>
        {
            ConfigureClient(c);
            c.Timeout = TimeSpan.FromSeconds(100);
        })
        .AddStandardResilienceHandler(o =>
        {
            o.AttemptTimeout.Timeout = TimeSpan.FromSeconds(30);
            o.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(90);
            o.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(60); // must be >= 2 × attempt timeout
        });

        // Streaming client: NO standard resilience handler. A total-request timeout or auto-retry would
        // abort or replay a partially-streamed completion. Cancellation flows through the caller's token;
        // the infinite client timeout lets long generations run to completion.
        services.AddHttpClient(OpenRouterClient.StreamClientName, c =>
        {
            ConfigureClient(c);
            c.Timeout = Timeout.InfiniteTimeSpan;
        });

        return services;
    }
}
