using Microsoft.AspNetCore.Identity;

namespace TeamPrompts.Infrastructure.Identity;

/// <summary>Application user. Email is the login identifier; roles are managed via Identity.</summary>
public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Canonical role names used by RBAC policies.</summary>
public static class AppRoles
{
    public const string Admin = "Admin";
    public const string Member = "Member";

    public static readonly string[] All = [Admin, Member];
}
