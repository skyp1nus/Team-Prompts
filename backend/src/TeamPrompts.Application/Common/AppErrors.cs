namespace TeamPrompts.Application.Common;

/// <summary>Defaults for the generation flow.</summary>
public static class GenerationDefaults
{
    /// <summary>Variants produced per session (spec: ~4–6).</summary>
    public const int VariantCount = 5;

    /// <summary>Sampling temperature — kept high to diversify variants.</summary>
    public const double Temperature = 0.9;

    public const string FallbackModel = "openai/gpt-5";
}

/// <summary>Thrown when a referenced entity does not exist → mapped to HTTP 404.</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>Thrown when the current user may not perform an action → mapped to HTTP 403.</summary>
public sealed class ForbiddenException(string message) : Exception(message);

/// <summary>Thrown for invalid operations / bad state → mapped to HTTP 400.</summary>
public sealed class AppValidationException(string message) : Exception(message);
