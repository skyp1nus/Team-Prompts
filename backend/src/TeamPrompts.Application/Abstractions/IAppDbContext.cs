using Microsoft.EntityFrameworkCore;
using TeamPrompts.Domain.Entities;

namespace TeamPrompts.Application.Abstractions;

/// <summary>Persistence seam for Application services — implemented by Infrastructure's AppDbContext.</summary>
public interface IAppDbContext
{
    DbSet<Script> Scripts { get; }
    DbSet<Prompt> Prompts { get; }
    DbSet<PromptVersion> PromptVersions { get; }
    DbSet<GenerationRun> GenerationRuns { get; }
    DbSet<GenerationSession> GenerationSessions { get; }
    DbSet<GenerationResult> GenerationResults { get; }
    DbSet<ResultFavorite> ResultFavorites { get; }
    DbSet<ResultCopyEvent> ResultCopyEvents { get; }
    DbSet<ActivityEvent> ActivityEvents { get; }
    DbSet<AppSettings> AppSettings { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
