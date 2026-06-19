using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Application.Services;

namespace TeamPrompts.Api.Controllers;

[ApiController]
[Route("api/generation")]
[Authorize]
public sealed class GenerationController(IGenerationService generation) : ControllerBase
{
    /// <summary>Single or batch: scripts × prompts → one session each (one Run when more than one).</summary>
    [HttpPost]
    public async Task<ActionResult<GenerationRunDto>> Create(CreateGenerationRequest req, CancellationToken ct)
        => Ok(await generation.CreateAsync(req, ct));

    /// <summary>Regenerate / "try another model": new session for the same script + prompt-version.</summary>
    [HttpPost("sessions/{sessionId:guid}/regenerate")]
    public async Task<ActionResult<SessionDto>> Regenerate(Guid sessionId, RegenerateRequest req, CancellationToken ct)
        => Ok(await generation.RegenerateAsync(sessionId, req.Model, ct));

    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<ActionResult<SessionWithResultsDto>> GetSession(Guid sessionId, CancellationToken ct)
        => await generation.GetSessionAsync(sessionId, ct) is { } dto ? Ok(dto) : NotFound();
}
