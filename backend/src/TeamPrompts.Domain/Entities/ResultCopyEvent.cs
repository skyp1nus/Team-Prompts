namespace TeamPrompts.Domain.Entities;

/// <summary>Attribution for "what was copied" — recorded when a user copies a result.</summary>
public class ResultCopyEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GenerationResultId { get; set; }
    public GenerationResult? GenerationResult { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
