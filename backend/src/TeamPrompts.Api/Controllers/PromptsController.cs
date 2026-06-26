using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Application.Services;
using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/prompts")]
[Authorize]
public sealed class PromptsController(IPromptService prompts) : ControllerBase
{
    /// <summary><paramref name="kind"/> filters the library (Metadata vs ScriptTransform); omitted → all.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PromptListItemDto>>> List(
        [FromQuery] Guid? workspaceId, [FromQuery] PromptKind? kind, CancellationToken ct)
        => Ok(await prompts.ListAsync(workspaceId, kind, ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PromptDetailDto>> Get(Guid id, CancellationToken ct)
        => await prompts.GetAsync(id, ct) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<ActionResult<PromptDetailDto>> Create(CreatePromptRequest req, CancellationToken ct)
    {
        var dto = await prompts.CreateAsync(req, ct);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PromptDetailDto>> Rename(Guid id, UpdatePromptRequest req, CancellationToken ct)
        => Ok(await prompts.RenameAsync(id, req.Name, ct));

    /// <summary>Set the team-wide top-to-bottom order of a workspace's prompts (drives the map layout).</summary>
    [HttpPut("reorder")]
    public async Task<IActionResult> Reorder(ReorderPromptsRequest req, CancellationToken ct)
    {
        await prompts.ReorderAsync(req, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await prompts.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>Branch a new version from an existing one (records author + note).</summary>
    [HttpPost("{id:guid}/versions")]
    public async Task<ActionResult<PromptVersionDto>> CreateVersion(Guid id, CreateVersionRequest req, CancellationToken ct)
        => Ok(await prompts.CreateVersionAsync(id, req, ct));

    /// <summary>Promote a version to Main — everyone uses it by default afterwards.</summary>
    [HttpPost("{id:guid}/versions/{versionId:guid}/promote")]
    public async Task<ActionResult<PromptDetailDto>> Promote(Guid id, Guid versionId, CancellationToken ct)
        => Ok(await prompts.PromoteAsync(id, versionId, ct));
}
