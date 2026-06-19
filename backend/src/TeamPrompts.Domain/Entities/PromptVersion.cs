namespace TeamPrompts.Domain.Entities;

/// <summary>One version of a prompt. Branching: <see cref="ParentVersionId"/> points at the source.</summary>
public class PromptVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PromptId { get; set; }
    public Prompt? Prompt { get; set; }

    /// <summary>Null for the first/root version; otherwise the version this one branched from.</summary>
    public Guid? ParentVersionId { get; set; }
    public PromptVersion? ParentVersion { get; set; }

    public string Content { get; set; } = string.Empty;
    public string AuthorUserId { get; set; } = string.Empty;

    /// <summary>Short human note describing the branch/change.</summary>
    public string? Note { get; set; }

    public bool IsMain { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<PromptVersion> Children { get; set; } = new List<PromptVersion>();
}
