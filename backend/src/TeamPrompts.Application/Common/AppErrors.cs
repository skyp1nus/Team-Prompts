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

    /// <summary>
    /// Always-on system message for script-variant generation: transform a SOURCE script into a new
    /// full script (a condensed "вижимка", a rewrite, a tone shift) per the user's instruction. Unlike
    /// metadata generation this returns ONE document, not a list of options.
    /// </summary>
    public static string ScriptTransformSystem() =>
        """
        You transform a source video script into a NEW script according to the user's instruction
        (for example: condense it into a tight summary / "вижимка", rewrite it, or shift its tone).
        Output rules:
        - Return ONLY the resulting script text — no preamble, no commentary, no headings, no labels,
          no surrounding quotes.
        - Write it as a finished, ready-to-use script. Light structure (line breaks, short paragraphs)
          is fine; add Markdown only if the instruction explicitly asks for it.
        - Base it strictly on the source script. Do not invent facts that are absent from it.
        """;

    /// <summary>
    /// The project's keyword/SEO terms, delivered in the always-on system context for keyword-aware
    /// prompts (UseKeywords=true) that don't place a <c>{{keywords}}</c> token themselves. Guidance,
    /// not a hard list — the model weaves them in where they fit naturally.
    /// </summary>
    public static string KeywordsBlock(string keywords) =>
        $"""
        Naturally weave in the following project keywords / SEO terms where they fit. Prioritise these
        topics and phrasings, but never force them or list them verbatim if it hurts readability.

        <keywords>
        {keywords}
        </keywords>
        """;

    /// <summary>The source script to transform, delivered in the always-on system context so the
    /// editable transform prompt stays a pure instruction.</summary>
    public static string SourceScriptBlock(string script) =>
        $"""
        Here is the source video script to transform.

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
