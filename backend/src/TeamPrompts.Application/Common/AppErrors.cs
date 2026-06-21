namespace TeamPrompts.Application.Common;

/// <summary>Defaults for the generation flow.</summary>
public static class GenerationDefaults
{
    /// <summary>How many options to produce when the prompt doesn't ask for a specific number.</summary>
    public const int VariantCount = 5;

    /// <summary>Hard upper bound on options parsed from one completion (safety cap, prompt-driven below).</summary>
    public const int MaxVariantCount = 20;

    /// <summary>Sampling temperature — kept high to diversify the options within the single completion.</summary>
    public const double Temperature = 0.9;

    public const string FallbackModel = "openai/gpt-5";

    /// <summary>
    /// Always-on output-hygiene system message, prepended to every generation. It enforces FORMAT
    /// (plain text, one option per line, no markdown) but lets the task prompt decide HOW MANY
    /// options to produce, defaulting to <see cref="VariantCount"/> when unspecified.
    /// </summary>
    public static string SystemGuardrail() =>
        $"""
        You generate YouTube video metadata from a script. Follow these OUTPUT rules exactly:
        - Produce the number of options the task asks for. If it doesn't specify, give about {VariantCount}.
        - One option per line. Plain text ONLY — no Markdown, no asterisks (**), no backticks, no
          headings, no bold or italics.
        - No numbering, no bullets, no leading symbols, no surrounding quotes, no labels.
        - No preamble, no commentary, no trailing notes. Output only the option lines.
        - Each line is one complete, self-contained option that stands on its own.
        """;

    /// <summary>
    /// The video script, delivered as part of the always-on system context so the user's editable
    /// prompt stays a pure brief — they never have to write SCRIPT: or {{script}} themselves.
    /// </summary>
    public static string ScriptBlock(string script) =>
        $"""
        Base every option strictly on the following video script. Do not invent facts absent from it.

        <script>
        {script}
        </script>
        """;
}

/// <summary>Thrown when a referenced entity does not exist → mapped to HTTP 404.</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>Thrown when the current user may not perform an action → mapped to HTTP 403.</summary>
public sealed class ForbiddenException(string message) : Exception(message);

/// <summary>Thrown for invalid operations / bad state → mapped to HTTP 400.</summary>
public sealed class AppValidationException(string message) : Exception(message);
