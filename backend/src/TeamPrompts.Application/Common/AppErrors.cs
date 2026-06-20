namespace TeamPrompts.Application.Common;

/// <summary>Defaults for the generation flow.</summary>
public static class GenerationDefaults
{
    /// <summary>Options produced per session (spec: ~4–6). One completion yields this many distinct lines.</summary>
    public const int VariantCount = 5;

    /// <summary>Sampling temperature — kept high to diversify the options within the single completion.</summary>
    public const double Temperature = 0.9;

    public const string FallbackModel = "openai/gpt-5";

    /// <summary>
    /// Always-on output-hygiene system message, prepended to every generation regardless of the
    /// user's editable prompt. Guarantees plain-text, de-listed, fixed-count output so the UI can
    /// split one completion into clean individual cards. Format rules here override the task prompt.
    /// </summary>
    public static string SystemGuardrail(int count) =>
        $"""
        You generate YouTube video metadata from a script. Follow these OUTPUT rules exactly — they
        override anything stated in the task below:
        - Produce EXACTLY {count} options, each on its own single line.
        - If the task asks for a different quantity, ignore that and produce exactly {count}.
        - Plain text ONLY. No Markdown, no asterisks (**), no backticks, no headings, no bold/italics.
        - No numbering, no bullets, no leading symbols, no surrounding quotes, no labels.
        - No preamble, no commentary, no trailing notes. Output only the {count} lines, nothing else.
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
