using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize]
public sealed class SettingsController(ISettingsService settings) : ControllerBase
{
    /// <summary>Masked state — never returns the API key, only whether one is set.</summary>
    [HttpGet]
    public async Task<ActionResult<SettingsDto>> Get(CancellationToken ct)
        => Ok(await settings.GetAsync(ct));

    [HttpGet("models")]
    public async Task<ActionResult<IReadOnlyList<ModelDto>>> Models(CancellationToken ct)
        => Ok(await settings.GetModelsAsync(ct));

    [HttpPut("api-key")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> SetApiKey(SetApiKeyRequest req, CancellationToken ct)
    {
        await settings.SetApiKeyAsync(req.ApiKey, ct);
        return NoContent();
    }

    /// <summary>Admin: remove the stored API key so a new one can be set.</summary>
    [HttpDelete("api-key")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> DeleteApiKey(CancellationToken ct)
    {
        await settings.DeleteApiKeyAsync(ct);
        return NoContent();
    }

    /// <summary>Admin: set the team's favorite models (first one becomes the generation fallback).</summary>
    [HttpPut("favorite-models")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> SetFavoriteModels(SetFavoriteModelsRequest req, CancellationToken ct)
    {
        await settings.SetFavoriteModelsAsync(req.Models, ct);
        return NoContent();
    }

    /// <summary>Admin: fetch the live model list from OpenRouter and cache it.</summary>
    [HttpPost("models/refresh")]
    [Authorize(Policy = "Admin")]
    public async Task<ActionResult<IReadOnlyList<ModelDto>>> RefreshModels(CancellationToken ct)
        => Ok(await settings.RefreshModelsAsync(ct));
}
