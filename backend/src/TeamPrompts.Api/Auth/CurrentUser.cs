using System.Security.Claims;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Infrastructure.Identity;

namespace TeamPrompts.Api.Auth;

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public string? UserId => Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
    public string? Email => Principal?.FindFirstValue(ClaimTypes.Email) ?? Principal?.Identity?.Name;
    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;
    public bool IsAdmin => Principal?.IsInRole(AppRoles.Admin) ?? false;
}
