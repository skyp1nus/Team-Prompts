using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Services;

/// <summary>
/// Ensures every workspace owns the "Unique" prompts — the workspace-singleton prompts each of a fixed
/// <see cref="PromptKind"/>: the master <see cref="PromptKind.Summary"/> (the mind-map source), plus
/// <see cref="PromptKind.Tags"/> and <see cref="PromptKind.Description"/>. Idempotent and keyed on
/// (workspace, kind), so it's safe to call on every startup (backfilling existing workspaces) and when a
/// new workspace is created — and it never adds a second Summary where the team already made one. The
/// content is seeded EMPTY: a prompt only counts as "configured" once the team fills in its instructions
/// (see PromptService.IsConfigured), and until then it burns as unconfigured.
/// </summary>
public static class StaticPromptSeeder
{
    public static async Task EnsureAsync(IAppDbContext db, Guid workspaceId, string createdByUserId, CancellationToken ct = default)
    {
        // The master Summary is the workspace's mind-map source — seed it so the team never has to create
        // one; keyword injection doesn't apply to it. Skipped when a Summary prompt already exists.
        await EnsureOneAsync(db, workspaceId, PromptKind.Summary, PromptDefaults.SummaryName, useKeywords: false, createdByUserId, ct);
        await EnsureOneAsync(db, workspaceId, PromptKind.Tags, PromptDefaults.TagsName, useKeywords: true, createdByUserId, ct);
        await EnsureOneAsync(db, workspaceId, PromptKind.Description, PromptDefaults.DescriptionName, useKeywords: true, createdByUserId, ct);
    }

    private static async Task EnsureOneAsync(
        IAppDbContext db, Guid workspaceId, PromptKind kind, string name, bool useKeywords, string userId, CancellationToken ct)
    {
        if (await db.Prompts.AnyAsync(p => p.WorkspaceId == workspaceId && p.Kind == kind, ct))
            return;

        // Seed at the top of the library (lowest SortOrder), matching how CreateAsync places new prompts.
        var minOrder = await db.Prompts
            .Where(p => p.WorkspaceId == workspaceId)
            .Select(p => (int?)p.SortOrder)
            .MinAsync(ct) ?? 0;

        var prompt = new Prompt
        {
            WorkspaceId = workspaceId,
            Name = name,
            Kind = kind,
            UseKeywords = useKeywords,
            UseSummarySource = false,
            CreatedByUserId = userId,
            SortOrder = minOrder - 1,
        };
        var version = new PromptVersion
        {
            PromptId = prompt.Id,
            Content = string.Empty, // unconfigured until the team writes the prompt
            AuthorUserId = userId,
            Note = "Seeded",
            IsMain = true,
        };

        db.Prompts.Add(prompt);
        db.PromptVersions.Add(version);
        await db.SaveChangesAsync(ct); // insert both first (MainVersionId null) to avoid the circular FK

        prompt.MainVersionId = version.Id;
        await db.SaveChangesAsync(ct);
    }
}
