using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Domain.Entities;

/// <summary>One prompt-version run against one script with one model. Produces ~4–6 results.</summary>
public class GenerationSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? RunId { get; set; }
    public GenerationRun? Run { get; set; }

    public Guid ScriptId { get; set; }
    public Script? Script { get; set; }

    public Guid PromptId { get; set; }
    public Prompt? Prompt { get; set; }

    public Guid PromptVersionId { get; set; }
    public PromptVersion? PromptVersion { get; set; }

    /// <summary>OpenRouter model id, e.g. <c>openai/gpt-5</c>. Per-session — enables "try another model".</summary>
    public string Model { get; set; } = string.Empty;

    public SessionStatus Status { get; set; }
    public string? Error { get; set; }

    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    public ICollection<GenerationResult> Results { get; set; } = new List<GenerationResult>();
}
