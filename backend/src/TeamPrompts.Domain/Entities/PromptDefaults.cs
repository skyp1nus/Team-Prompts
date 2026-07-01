namespace TeamPrompts.Domain.Entities;

/// <summary>
/// Names for the workspace-static prompts (<see cref="Enums.PromptKind.Tags"/> and
/// <see cref="Enums.PromptKind.Description"/>). Exactly one of each is seeded into every workspace — existing
/// and future — by the static-prompt seeder, with EMPTY content: the team fills in the instructions, and a
/// prompt only counts as "configured" once it has content.
/// </summary>
public static class PromptDefaults
{
    public const string SummaryName = "Summary";
    public const string TagsName = "Tags";
    public const string DescriptionName = "Description";
}
