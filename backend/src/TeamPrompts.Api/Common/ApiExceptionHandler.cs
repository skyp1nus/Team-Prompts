using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Common;

namespace TeamPrompts.Api.Common;

/// <summary>Maps Application exceptions to ProblemDetails responses.</summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        // Client aborted the request (navigation, react-query cancelling a stale query) — not an
        // error. Swallow without logging; the client is gone so there's nothing to write back.
        if (ex is OperationCanceledException && ctx.RequestAborted.IsCancellationRequested)
        {
            if (!ctx.Response.HasStarted)
                ctx.Response.StatusCode = 499; // client closed request
            return true;
        }

        var (status, title) = ex switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, ex.Message),
            ForbiddenException => (StatusCodes.Status403Forbidden, ex.Message),
            AppValidationException => (StatusCodes.Status400BadRequest, ex.Message),
            FluentValidation.ValidationException => (StatusCodes.Status400BadRequest, ex.Message),
            InvalidOperationException => (StatusCodes.Status400BadRequest, ex.Message),
            // A concurrent write lost a unique-index race — retryable, not a server fault.
            DbUpdateException => (StatusCodes.Status409Conflict, "The change conflicted with a concurrent update — please retry."),
            _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred."),
        };

        if (status == StatusCodes.Status500InternalServerError)
            logger.LogError(ex, "Unhandled exception");

        ctx.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = title,
                Detail = status == StatusCodes.Status500InternalServerError ? null : ex.Message,
            },
        });
    }
}
