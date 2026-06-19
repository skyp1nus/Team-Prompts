using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Domain.Entities;

/// <summary>Groups the sessions created by one batch action (scripts × prompts). Null for single-shot.</summary>
public class GenerationRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public RunStatus Status { get; set; }

    public ICollection<GenerationSession> Sessions { get; set; } = new List<GenerationSession>();
}
