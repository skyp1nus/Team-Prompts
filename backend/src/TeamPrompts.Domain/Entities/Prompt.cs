namespace TeamPrompts.Domain.Entities;

/// <summary>A reusable prompt in the team library. Has a Main version plus a tree of branches.</summary>
public class Prompt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>The version everyone uses by default. Promote-to-Main repoints this.</summary>
    public Guid? MainVersionId { get; set; }
    public PromptVersion? MainVersion { get; set; }

    public ICollection<PromptVersion> Versions { get; set; } = new List<PromptVersion>();
}
