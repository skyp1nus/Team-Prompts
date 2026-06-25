using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/workspaces")]
[Authorize]
public sealed class WorkspacesController(IWorkspaceService workspaces) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WorkspaceDto>>> List(CancellationToken ct)
        => Ok(await workspaces.ListAsync(ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<WorkspaceDto>> Get(Guid id, CancellationToken ct)
        => await workspaces.GetAsync(id, ct) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<ActionResult<WorkspaceDto>> Create(CreateWorkspaceRequest req, CancellationToken ct)
    {
        var dto = await workspaces.CreateAsync(req, ct);
        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<WorkspaceDto>> Update(Guid id, UpdateWorkspaceRequest req, CancellationToken ct)
        => Ok(await workspaces.UpdateAsync(id, req, ct));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await workspaces.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>Upload (or replace) the workspace's dock avatar.</summary>
    [HttpPost("{id:guid}/avatar")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<ActionResult<WorkspaceDto>> SetAvatar(Guid id, [FromForm] IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest("A non-empty image is required.");

        await using var stream = file.OpenReadStream();
        return Ok(await workspaces.SetAvatarAsync(id, file.FileName, file.ContentType, stream, ct));
    }

    /// <summary>Serve the stored avatar bytes (custom uploads only; seeded channels use static FE assets).
    /// Anonymous so an &lt;img&gt; tag can load it cross-origin in dev without the auth cookie.</summary>
    [HttpGet("{id:guid}/avatar")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAvatar(Guid id, CancellationToken ct)
    {
        var avatar = await workspaces.GetAvatarAsync(id, ct);
        if (avatar is null) return NotFound();
        // Stop the browser sniffing a different (script-capable) type from the bytes.
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(avatar.Content, avatar.ContentType);
    }
}
