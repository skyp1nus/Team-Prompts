using Hangfire.Dashboard;
using TeamPrompts.Infrastructure.Identity;

namespace TeamPrompts.Api.Auth;

/// <summary>Gates the Hangfire dashboard to authenticated admins.</summary>
public sealed class HangfireAdminAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var http = context.GetHttpContext();
        return http.User.Identity?.IsAuthenticated == true && http.User.IsInRole(AppRoles.Admin);
    }
}
