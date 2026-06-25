using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TeamPrompts.Domain.Entities;

namespace TeamPrompts.Application.Abstractions;

/// <summary>Persistence seam for Application services — implemented by Infrastructure's AppDbContext.</summary>
public interface IAppDbContext
{
    /// <summary>Exposed so services can open an explicit transaction for multi-statement writes.</summary>
    DatabaseFacade Database { get; }

    DbSet<Workspace> Workspaces { get; }
    DbSet<Script> Scripts { get; }
    DbSet<Prompt> Prompts { get; }
    DbSet<PromptVersion> PromptVersions { get; }
    DbSet<GenerationRun> GenerationRuns { get; }
    DbSet<GenerationSession> GenerationSessions { get; }
    DbSet<GenerationResult> GenerationResults { get; }
    DbSet<ResultFavorite> ResultFavorites { get; }
    DbSet<ResultCopyEvent> ResultCopyEvents { get; }
    DbSet<CanvasNode> CanvasNodes { get; }
    DbSet<ActivityEvent> ActivityEvents { get; }
    DbSet<AppSettings> AppSettings { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
