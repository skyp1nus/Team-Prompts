using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Application.Services;
using TeamPrompts.Domain.Enums;
using TeamPrompts.Infrastructure.Identity;

namespace TeamPrompts.Api.Controllers;

/// <summary>Read-only access to the immutable activity log + per-user profiles. Owner/Admin only.</summary>
[ApiController]
[Route("api/activity")]
[Authorize(Policy = "Admin")]
public sealed class ActivityController(IActivityService activity, UserManager<AppUser> userManager) : ControllerBase
{
    /// <summary>Global feed, newest first. Optionally filtered by actor user id and/or event type.</summary>
    [HttpGet]
    public async Task<ActionResult<ActivityFeedDto>> Feed(
        [FromQuery] int skip = 0,
        [FromQuery] int take = 30,
        [FromQuery] string? userId = null,
        [FromQuery] ActivityEventType? type = null,
        CancellationToken ct = default)
        => Ok(await activity.GetFeedAsync(skip, take, userId, type, ct));

    /// <summary>One user's profile: who they are, what they spent, and a recent action feed.</summary>
    [HttpGet("users/{userId}/profile")]
    public async Task<ActionResult<UserProfileDto>> Profile(string userId, CancellationToken ct)
    {
        var u = await userManager.FindByIdAsync(userId);
        if (u is null) return NotFound();

        var roles = await userManager.GetRolesAsync(u);
        var stats = await activity.GetUserAggregatesAsync(userId, ct);
        var recent = await activity.GetFeedAsync(0, 20, userId, null, ct);

        return new UserProfileDto(
            new UserRef(u.Id, u.DisplayName, u.Email),
            roles.ToList(), stats, recent.Items);
    }
}
