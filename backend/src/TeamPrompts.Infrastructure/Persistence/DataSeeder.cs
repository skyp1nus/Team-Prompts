using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TeamPrompts.Application.Services;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Infrastructure.Identity;

namespace TeamPrompts.Infrastructure.Persistence;

/// <summary>Applies migrations, seeds roles, the admin user, the single AppSettings row, and the
/// per-workspace static Tags &amp; Description prompts.</summary>
public static class DataSeeder
{
    public static async Task SeedAsync(IServiceProvider sp, string adminEmail, string adminPassword, bool applyMigrations = true)
    {
        using var scope = sp.CreateScope();
        var services = scope.ServiceProvider;
        var db = services.GetRequiredService<AppDbContext>();

        if (applyMigrations)
            await db.Database.MigrateAsync();

        var roleMgr = services.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in AppRoles.All)
        {
            if (!await roleMgr.RoleExistsAsync(role))
                await roleMgr.CreateAsync(new IdentityRole(role));
        }

        var userMgr = services.GetRequiredService<UserManager<AppUser>>();
        var seedUserId = string.Empty; // attribution for system-seeded rows (empty is a valid, unresolved user)
        if (!string.IsNullOrWhiteSpace(adminEmail))
        {
            var admin = await userMgr.FindByEmailAsync(adminEmail);
            if (admin is null)
            {
                admin = new AppUser
                {
                    UserName = adminEmail,
                    Email = adminEmail,
                    EmailConfirmed = true,
                    DisplayName = "Administrator",
                };
                var result = await userMgr.CreateAsync(admin, adminPassword);
                if (!result.Succeeded)
                    throw new InvalidOperationException(
                        "Admin seed failed: " + string.Join(", ", result.Errors.Select(e => e.Description)));
            }

            // Bootstrap account is the single Admin. The Owner is created later BY the admin and is
            // a singleton — so never auto-grant Owner here (strip it if a previous seed added it).
            if (!await userMgr.IsInRoleAsync(admin, AppRoles.Admin))
                await userMgr.AddToRoleAsync(admin, AppRoles.Admin);
            if (await userMgr.IsInRoleAsync(admin, AppRoles.Owner))
                await userMgr.RemoveFromRoleAsync(admin, AppRoles.Owner);

            seedUserId = admin.Id;
        }

        if (!await db.AppSettings.AnyAsync())
        {
            db.AppSettings.Add(new AppSettings { Id = 1, UpdatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }

        // Backfill the static Tags & Description prompts into every workspace (idempotent). New workspaces
        // created at runtime are seeded by WorkspaceService.CreateAsync, so this only fills in the gaps.
        var workspaceIds = await db.Workspaces.Select(w => w.Id).ToListAsync();
        foreach (var workspaceId in workspaceIds)
            await StaticPromptSeeder.EnsureAsync(db, workspaceId, seedUserId);
    }
}
