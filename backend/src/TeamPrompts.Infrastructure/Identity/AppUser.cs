using Microsoft.AspNetCore.Identity;

namespace TeamPrompts.Infrastructure.Identity;

/// <summary>Application user. Email is the login identifier; roles are managed via Identity.</summary>
public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Canonical role names used by RBAC policies, from most to least privileged. Owner is the top
/// privilege (superset of Admin). PromptEditor sits between Admin and Member: it can do everything a
/// Member can PLUS view/edit prompts and choose the generation model. Viewer is the floor — it can only
/// view results and copy/favorite/highlight them.</summary>
public static class AppRoles
{
    public const string Owner = "Owner";
    public const string Admin = "Admin";

    /// <summary>Can view + edit prompts and pick the generation model, on top of everything a Member does.</summary>
    public const string PromptEditor = "PromptEditor";

    public const string Member = "Member";

    /// <summary>Read-only consumer: view results, copy, favorite, highlight. No upload/generate/prompts.</summary>
    public const string Viewer = "Viewer";

    /// <summary>Roles allowed to see/manage privileged settings (API key, favorite models, users, deletes).</summary>
    public static readonly string[] Privileged = [Owner, Admin];

    /// <summary>Roles allowed to view/edit prompt content and choose the generation model.</summary>
    public static readonly string[] PromptEditors = [Owner, Admin, PromptEditor];

    /// <summary>Roles allowed to upload, generate and edit scripts (everyone except Viewer).</summary>
    public static readonly string[] Members = [Owner, Admin, PromptEditor, Member];

    public static readonly string[] All = [Owner, Admin, PromptEditor, Member, Viewer];
}
