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
        services.AddHttpClient<IOpenRouterClient, OpenRouterClient>(c =>
        {
            c.BaseAddress = new Uri(baseUrl);
            c.DefaultRequestHeaders.Add("X-Title", "Team Prompts");
            c.Timeout = TimeSpan.FromMinutes(5);
        })
        .AddStandardResilienceHandler(o =>
        {
            // Generous timeouts so long token streams aren't cut; retry + circuit breaker for transient faults.
            o.AttemptTimeout.Timeout = TimeSpan.FromMinutes(2);
            o.TotalRequestTimeout.Timeout = TimeSpan.FromMinutes(5);
            o.CircuitBreaker.SamplingDuration = TimeSpan.FromMinutes(4); // must be >= 2 × attempt timeout
        });

        return services;
    }
}
