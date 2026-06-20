using Microsoft.AspNetCore.Identity;

namespace TeamPrompts.Infrastructure.Identity;

/// <summary>Application user. Email is the login identifier; roles are managed via Identity.</summary>
public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Canonical role names used by RBAC policies. Owner is the top privilege (superset of Admin).</summary>
public static class AppRoles
{
    public const string Owner = "Owner";
    public const string Admin = "Admin";
    public const string Member = "Member";

    /// <summary>Roles allowed to see/manage privileged settings (API key, favorite models, users).</summary>
    public static readonly string[] Privileged = [Owner, Admin];

    public static readonly string[] All = [Owner, Admin, Member];
}
