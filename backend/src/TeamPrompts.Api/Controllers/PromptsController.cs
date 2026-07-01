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
    /// <summary><paramref name="kind"/> filters the library (MainScripts vs Summary); omitted → all.
    /// Returns names/metadata only (no content). Left open to any authenticated user because the center
    /// Map (which Viewers can see) reads this to order + group its prompt-branch lanes by name. Members
    /// additionally see it in the Prompts rail to pick a prompt; the rail is hidden for Viewers on the FE.
    /// Full prompt CONTENT is guarded separately on <see cref="Get"/>.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PromptListItemDto>>> List(
        [FromQuery] Guid? workspaceId, [FromQuery] PromptKind? kind, CancellationToken ct)
        => Ok(await prompts.ListAsync(workspaceId, kind, ct));

    /// <summary>Full prompt content + version history — PromptEditor and up only.</summary>
    [HttpGet("{id:guid}")]
    [Authorize(Policy = "PromptEditor")]
    public async Task<ActionResult<PromptDetailDto>> Get(Guid id, CancellationToken ct)
        => await prompts.GetAsync(id, ct) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    [Authorize(Policy = "PromptEditor")]
    public async Task<ActionResult<PromptDetailDto>> Create(CreatePromptRequest req, CancellationToken ct)
    {
        var dto = await prompts.CreateAsync(req, ct);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    /// <summary>Rename a prompt and/or toggle its keyword usage (<c>UseKeywords</c> null leaves it as-is).</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = "PromptEditor")]
    public async Task<ActionResult<PromptDetailDto>> Update(Guid id, UpdatePromptRequest req, CancellationToken ct)
        => Ok(await prompts.UpdateAsync(id, req, ct));

    /// <summary>Set the team-wide top-to-bottom order of a workspace's prompts (drives the map layout).</summary>
    [HttpPut("reorder")]
    [Authorize(Policy = "PromptEditor")]
    public async Task<IActionResult> Reorder(ReorderPromptsRequest req, CancellationToken ct)
    {
        await prompts.ReorderAsync(req, ct);
        return NoContent();
    }

    /// <summary>Delete a prompt — a destructive, shared action, so Owner/Admin only.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await prompts.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>Branch a new version from an existing one (records author + note).</summary>
    [HttpPost("{id:guid}/versions")]
    [Authorize(Policy = "PromptEditor")]
    public async Task<ActionResult<PromptVersionDto>> CreateVersion(Guid id, CreateVersionRequest req, CancellationToken ct)
        => Ok(await prompts.CreateVersionAsync(id, req, ct));

    /// <summary>Promote a version to Main — everyone uses it by default afterwards.</summary>
    [HttpPost("{id:guid}/versions/{versionId:guid}/promote")]
    [Authorize(Policy = "PromptEditor")]
    public async Task<ActionResult<PromptDetailDto>> Promote(Guid id, Guid versionId, CancellationToken ct)
        => Ok(await prompts.PromoteAsync(id, versionId, ct));
}
