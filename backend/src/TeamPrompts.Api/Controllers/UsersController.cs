using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Enums;
using TeamPrompts.Infrastructure.Identity;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Policy = "Admin")]
public sealed class UsersController(UserManager<AppUser> userManager, IActivityLogger activity) : ControllerBase
{
    /// <summary>Admin-only: create an account directly (no email invite flow).</summary>
    [HttpPost]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest req)
    {
        if (await userManager.FindByEmailAsync(req.Email) is not null)
            return Conflict("A user with this email already exists.");

        // Owner is a singleton — only one can ever exist.
        if (string.Equals(req.Role, AppRoles.Owner, StringComparison.OrdinalIgnoreCase)
            && (await userManager.GetUsersInRoleAsync(AppRoles.Owner)).Count > 0)
            return Conflict("An owner already exists — there can be only one.");

        var user = new AppUser
        {
            UserName = req.Email,
            Email = req.Email,
            EmailConfirmed = true,
            DisplayName = req.DisplayName,
        };

        var result = await userManager.CreateAsync(user, req.Password);
        if (!result.Succeeded)
        {
            var errors = result.Errors
                .GroupBy(e => e.Code)
                .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray());
            return ValidationProblem(new ValidationProblemDetails(errors));
        }

        await userManager.AddToRoleAsync(user, req.Role);

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.UserCreated,
            TargetType: ActivityTargetType.User, TargetUserId: user.Id,
            Summary: $"Created user {user.DisplayName} ({req.Role})"));

        return new UserDto(user.Id, user.Email!, user.DisplayName, [req.Role]);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserDto>>> List()
    {
        var users = userManager.Users.OrderBy(u => u.Email).ToList();
        var result = new List<UserDto>();
        foreach (var u in users)
            result.Add(new UserDto(u.Id, u.Email ?? string.Empty, u.DisplayName, (await userManager.GetRolesAsync(u)).ToList()));
        return result;
    }

    /// <summary>Owner/Admin: fetch one user (for their profile page).</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<UserDto>> Get(string id)
    {
        var u = await userManager.FindByIdAsync(id);
        if (u is null) return NotFound();
        return new UserDto(u.Id, u.Email ?? string.Empty, u.DisplayName, (await userManager.GetRolesAsync(u)).ToList());
    }
}
