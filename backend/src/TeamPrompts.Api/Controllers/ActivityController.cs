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
    private static DateTimeOffset? Since(int? days) =>
        days is > 0 ? DateTimeOffset.UtcNow.AddDays(-days.Value) : null;

    /// <summary>Global feed, newest first. Filter by actor, event type, and/or a trailing window (days).</summary>
    [HttpGet]
    public async Task<ActionResult<ActivityFeedDto>> Feed(
        [FromQuery] int skip = 0,
        [FromQuery] int take = 30,
        [FromQuery] string? userId = null,
        [FromQuery] ActivityEventType? type = null,
        [FromQuery] int? days = null,
        CancellationToken ct = default)
        => Ok(await activity.GetFeedAsync(skip, take, userId, type, Since(days), ct));

    /// <summary>One user's profile: who they are, what they spent, and a recent action feed.
    /// <paramref name="days"/> scopes the spend totals + feed to a trailing window (null = all time).</summary>
    [HttpGet("users/{userId}/profile")]
    public async Task<ActionResult<UserProfileDto>> Profile(
        string userId, [FromQuery] int? days = null, CancellationToken ct = default)
    {
        var u = await userManager.FindByIdAsync(userId);
        if (u is null) return NotFound();

        var since = Since(days);
        var roles = await userManager.GetRolesAsync(u);
        var stats = await activity.GetUserAggregatesAsync(userId, since, ct);
        var recent = await activity.GetFeedAsync(0, 20, userId, null, since, ct);

        return new UserProfileDto(
            new UserRef(u.Id, u.DisplayName, u.Email),
            roles.ToList(), stats, recent.Items);
    }
}
