using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Common;

namespace TeamPrompts.Api.Common;

/// <summary>Maps Application exceptions to ProblemDetails responses.</summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, title) = ex switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, ex.Message),
            ForbiddenException => (StatusCodes.Status403Forbidden, ex.Message),
            AppValidationException => (StatusCodes.Status400BadRequest, ex.Message),
            FluentValidation.ValidationException => (StatusCodes.Status400BadRequest, ex.Message),
            InvalidOperationException => (StatusCodes.Status400BadRequest, ex.Message),
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
