using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/results")]
[Authorize]
public sealed class ResultsController(IGenerationService generation) : ControllerBase
{
    [HttpPost("{resultId:guid}/favorite")]
    public async Task<ActionResult<bool>> Favorite(Guid resultId, CancellationToken ct)
        => Ok(await generation.ToggleFavoriteAsync(resultId, true, ct));

    [HttpDelete("{resultId:guid}/favorite")]
    public async Task<ActionResult<bool>> Unfavorite(Guid resultId, CancellationToken ct)
        => Ok(await generation.ToggleFavoriteAsync(resultId, false, ct));

    /// <summary>Records copy attribution ("what was copied").</summary>
    [HttpPost("{resultId:guid}/copy")]
    public async Task<IActionResult> Copy(Guid resultId, CancellationToken ct)
    {
        await generation.RecordCopyAsync(resultId, ct);
        return NoContent();
    }
}
