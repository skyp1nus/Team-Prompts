namespace TeamPrompts.Domain.Entities;

/// <summary>Marks a result as "best" by a user. A user's tray = their favorites for the active script.</summary>
public class ResultFavorite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GenerationResultId { get; set; }
    public GenerationResult? GenerationResult { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
