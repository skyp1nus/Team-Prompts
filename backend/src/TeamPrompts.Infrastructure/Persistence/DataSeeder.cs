using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Infrastructure.Identity;

namespace TeamPrompts.Infrastructure.Persistence;

/// <summary>Applies migrations, seeds roles, the admin user, and the single AppSettings row.</summary>
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
        if (!string.IsNullOrWhiteSpace(adminEmail) && await userMgr.FindByEmailAsync(adminEmail) is null)
        {
            var admin = new AppUser
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

            await userMgr.AddToRoleAsync(admin, AppRoles.Admin);
        }

        if (!await db.AppSettings.AnyAsync())
        {
            db.AppSettings.Add(new AppSettings { Id = 1, UpdatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
    }
}
