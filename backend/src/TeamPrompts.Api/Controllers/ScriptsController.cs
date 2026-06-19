using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/scripts")]
[Authorize]
public sealed class ScriptsController(IScriptService scripts) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ScriptListItemDto>>> List([FromQuery] string? search, CancellationToken ct)
        => Ok(await scripts.ListAsync(search, ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ScriptDto>> Get(Guid id, CancellationToken ct)
        => await scripts.GetAsync(id, ct) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<ActionResult<ScriptDto>> Upload([FromForm] IFormFile file, [FromForm] string? name, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest("A non-empty file is required.");

        await using var stream = file.OpenReadStream();
        var dto = await scripts.UploadAsync(file.FileName, file.ContentType, stream, name, ct);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ScriptDto>> Rename(Guid id, UpdateScriptRequest req, CancellationToken ct)
        => Ok(await scripts.RenameAsync(id, req.Name, ct));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await scripts.DeleteAsync(id, ct);
        return NoContent();
    }

    // ---- generation history for the active script (center block-map) ----

    [HttpGet("{id:guid}/sessions")]
    public async Task<ActionResult<IReadOnlyList<SessionWithResultsDto>>> Sessions(
        Guid id, [FromServices] IGenerationService generation, CancellationToken ct)
        => Ok(await generation.GetScriptSessionsAsync(id, ct));

    [HttpGet("{id:guid}/tray")]
    public async Task<ActionResult<IReadOnlyList<TrayItemDto>>> Tray(
        Guid id, [FromServices] IGenerationService generation, CancellationToken ct)
        => Ok(await generation.GetTrayAsync(id, ct));
}
