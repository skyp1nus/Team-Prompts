using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/script-projects")]
[Authorize]
public sealed class ScriptProjectsController(IScriptProjectService projects) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ScriptProjectListItemDto>>> List(
        [FromQuery] Guid? workspaceId, [FromQuery] string? search, CancellationToken ct)
        => Ok(await projects.ListAsync(workspaceId, search, ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ScriptProjectDto>> Get(Guid id, CancellationToken ct)
        => await projects.GetAsync(id, ct) is { } dto ? Ok(dto) : NotFound();

    /// <summary>Create a project from an uploaded .pdf/.txt file — the file becomes the Original script.</summary>
    [HttpPost]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<ActionResult<ScriptProjectDto>> Create(
        [FromForm] Guid workspaceId, [FromForm] IFormFile file, [FromForm] string? name, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest("A non-empty file is required.");

        await using var stream = file.OpenReadStream();
        var dto = await projects.CreateFromUploadAsync(workspaceId, file.FileName, file.ContentType, stream, name, ct);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ScriptProjectDto>> Rename(Guid id, UpdateScriptProjectRequest req, CancellationToken ct)
        => Ok(await projects.RenameAsync(id, req.Name, ct));

    /// <summary>Replace the project's keyword list (used by keyword-aware prompts). Empty clears it.</summary>
    [HttpPut("{id:guid}/keywords")]
    public async Task<ActionResult<ScriptProjectDto>> UpdateKeywords(Guid id, UpdateProjectKeywordsRequest req, CancellationToken ct)
        => Ok(await projects.UpdateKeywordsAsync(id, req.Content, ct));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await projects.DeleteAsync(id, ct);
        return NoContent();
    }

    // ---- variants (generated alternative scripts under a project) ----

    [HttpGet("{id:guid}/variants")]
    public async Task<ActionResult<IReadOnlyList<ScriptDto>>> Variants(Guid id, CancellationToken ct)
        => Ok(await projects.ListVariantsAsync(id, ct));

    /// <summary>Queue generation of a new script-variant (вижимка / rewrite). Returns the Queued variant.</summary>
    [HttpPost("{id:guid}/variants")]
    public async Task<ActionResult<ScriptDto>> GenerateVariant(Guid id, CreateScriptVariantRequest req, CancellationToken ct)
        => Ok(await projects.GenerateVariantAsync(id, req, ct));

    /// <summary>Make a variant the project's canonical script (repoints OriginalScriptId).</summary>
    [HttpPost("{id:guid}/variants/{variantId:guid}/promote")]
    public async Task<ActionResult<ScriptProjectDto>> PromoteVariant(Guid id, Guid variantId, CancellationToken ct)
        => Ok(await projects.PromoteVariantAsync(id, variantId, ct));

    [HttpDelete("{id:guid}/variants/{variantId:guid}")]
    public async Task<IActionResult> DeleteVariant(Guid id, Guid variantId, CancellationToken ct)
    {
        await projects.DeleteVariantAsync(id, variantId, ct);
        return NoContent();
    }
}
