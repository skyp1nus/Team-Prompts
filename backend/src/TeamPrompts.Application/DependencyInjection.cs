using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Services;

namespace TeamPrompts.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly);

        services.AddScoped<IScriptService, ScriptService>();
        services.AddScoped<IPromptService, PromptService>();
        services.AddScoped<IGenerationService, GenerationService>();
        services.AddScoped<IGenerationExecutor, GenerationExecutor>();
        services.AddScoped<ISettingsService, SettingsService>();

        return services;
    }
}
