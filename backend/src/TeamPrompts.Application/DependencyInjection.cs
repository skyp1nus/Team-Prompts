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

        services.AddScoped<IWorkspaceService, WorkspaceService>();
        services.AddScoped<IScriptService, ScriptService>();
        services.AddScoped<IScriptProjectService, ScriptProjectService>();
        services.AddScoped<IPromptService, PromptService>();
        services.AddScoped<IGenerationService, GenerationService>();
        services.AddScoped<ISummaryService, SummaryService>();
        services.AddScoped<ICanvasService, CanvasService>();
        services.AddScoped<IGenerationExecutor, GenerationExecutor>();
        services.AddScoped<IScriptVariantExecutor, ScriptVariantExecutor>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<IActivityLogger, ActivityLogger>();
        services.AddScoped<IActivityService, ActivityService>();

        return services;
    }
}
