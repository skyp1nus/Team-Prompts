using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Domain.Enums;
using TeamPrompts.Infrastructure.Identity;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/auth")]
[Authorize]
public sealed class AuthController(
    SignInManager<AppUser> signInManager,
    UserManager<AppUser> userManager,
    IActivityLogger activity) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<UserDto>> Login(LoginRequest req)
    {
        var user = await userManager.FindByEmailAsync(req.Email);
        if (user is null)
            return Unauthorized();

        var result = await signInManager.PasswordSignInAsync(user, req.Password, isPersistent: true, lockoutOnFailure: false);
        if (!result.Succeeded)
            return Unauthorized();

        await activity.LogAsync(new ActivityLogEntry(
            ActivityEventType.UserLoggedIn, ActorUserId: user.Id, Summary: "Signed in"));

        return await ToDto(user);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await signInManager.SignOutAsync();
        return NoContent();
    }

    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await userManager.GetUserAsync(User);
        return user is null ? Unauthorized() : await ToDto(user);
    }

    private async Task<UserDto> ToDto(AppUser u) =>
        new(u.Id, u.Email ?? string.Empty, u.DisplayName, (await userManager.GetRolesAsync(u)).ToList());
}
