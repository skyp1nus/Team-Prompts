using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Domain.Entities;
using TeamPrompts.Infrastructure.Identity;
using TeamPrompts.Infrastructure.Storage;

namespace TeamPrompts.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options), IAppDbContext
{
    public DbSet<Script> Scripts => Set<Script>();
    public DbSet<Prompt> Prompts => Set<Prompt>();
    public DbSet<PromptVersion> PromptVersions => Set<PromptVersion>();
    public DbSet<GenerationRun> GenerationRuns => Set<GenerationRun>();
    public DbSet<GenerationSession> GenerationSessions => Set<GenerationSession>();
    public DbSet<GenerationResult> GenerationResults => Set<GenerationResult>();
    public DbSet<ResultFavorite> ResultFavorites => Set<ResultFavorite>();
    public DbSet<ResultCopyEvent> ResultCopyEvents => Set<ResultCopyEvent>();
    public DbSet<StoredFile> StoredFiles => Set<StoredFile>();
    public DbSet<AppSettings> AppSettings => Set<AppSettings>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<Script>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(300).IsRequired();
            e.Property(x => x.OriginalFileName).HasMaxLength(500);
            e.Property(x => x.CreatedByUserId).HasMaxLength(450);
            e.HasIndex(x => x.Name);
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<Prompt>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(300).IsRequired();
            e.Property(x => x.CreatedByUserId).HasMaxLength(450);
            e.HasIndex(x => x.Name);

            // Two relationships to PromptVersion: the version list (cascade) and the Main pointer (restrict).
            e.HasMany(x => x.Versions)
                .WithOne(v => v.Prompt!)
                .HasForeignKey(v => v.PromptId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.MainVersion)
                .WithMany()
                .HasForeignKey(x => x.MainVersionId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<PromptVersion>(e =>
        {
            e.Property(x => x.AuthorUserId).HasMaxLength(450);
            e.Property(x => x.Note).HasMaxLength(1000);
            e.HasIndex(x => x.PromptId);

            e.HasOne(x => x.ParentVersion)
                .WithMany(x => x.Children)
                .HasForeignKey(x => x.ParentVersionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<GenerationRun>(e =>
        {
            e.Property(x => x.CreatedByUserId).HasMaxLength(450);
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<GenerationSession>(e =>
        {
            e.Property(x => x.Model).HasMaxLength(200).IsRequired();
            e.Property(x => x.CreatedByUserId).HasMaxLength(450);
            e.Property(x => x.Error).HasMaxLength(4000);
            e.HasIndex(x => x.ScriptId);
            e.HasIndex(x => x.CreatedAt);

            e.HasOne(x => x.Run)
                .WithMany(r => r.Sessions)
                .HasForeignKey(x => x.RunId)
                .OnDelete(DeleteBehavior.SetNull);

            e.HasOne(x => x.Script)
                .WithMany(s => s.Sessions)
                .HasForeignKey(x => x.ScriptId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Prompt)
                .WithMany()
                .HasForeignKey(x => x.PromptId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.PromptVersion)
                .WithMany()
                .HasForeignKey(x => x.PromptVersionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<GenerationResult>(e =>
        {
            e.Property(x => x.Content).IsRequired();
            e.HasIndex(x => x.SessionId);

            e.HasOne(x => x.Session)
                .WithMany(s => s.Results)
                .HasForeignKey(x => x.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ResultFavorite>(e =>
        {
            e.Property(x => x.UserId).HasMaxLength(450);
            e.HasIndex(x => new { x.GenerationResultId, x.UserId }).IsUnique();

            e.HasOne(x => x.GenerationResult)
                .WithMany(r => r.Favorites)
                .HasForeignKey(x => x.GenerationResultId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ResultCopyEvent>(e =>
        {
            e.Property(x => x.UserId).HasMaxLength(450);
            e.HasIndex(x => x.GenerationResultId);

            e.HasOne(x => x.GenerationResult)
                .WithMany(r => r.CopyEvents)
                .HasForeignKey(x => x.GenerationResultId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<StoredFile>(e =>
        {
            e.Property(x => x.FileName).HasMaxLength(500);
            e.Property(x => x.ContentType).HasMaxLength(200);
        });

        b.Entity<AppSettings>(e =>
        {
            e.Property(x => x.DefaultModel).HasMaxLength(200);
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges()
    {
        StampTimestamps();
        return base.SaveChanges();
    }

    /// <summary>Auto-stamps CreatedAt (on insert) and UpdatedAt (on insert/update) where those props exist.</summary>
    private void StampTimestamps()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified))
                continue;

            if (entry.State == EntityState.Added && entry.Metadata.FindProperty("CreatedAt") is not null)
            {
                var created = entry.Property("CreatedAt");
                if (created.CurrentValue is DateTimeOffset dto && dto == default)
                    created.CurrentValue = now;
            }

            if (entry.Metadata.FindProperty("UpdatedAt") is not null)
                entry.Property("UpdatedAt").CurrentValue = now;
        }
    }
}
