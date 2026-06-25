namespace TeamPrompts.Domain.Entities;

/// <summary>
/// Stable, well-known ids for the seeded workspaces. Fixed Guids let the migration backfill existing
/// Scripts/Prompts onto <see cref="GeneralId"/> and keep the system space identifiable across DBs.
/// </summary>
public static class WorkspaceDefaults
{
    /// <summary>The non-deletable system space. Existing/un-scoped content lands here.</summary>
    public static readonly Guid GeneralId = new("11111111-1111-1111-1111-111111111111");
    public static readonly Guid TtId = new("22222222-2222-2222-2222-222222222222");
    public static readonly Guid TId = new("33333333-3333-3333-3333-333333333333");
    public static readonly Guid GId = new("44444444-4444-4444-4444-444444444444");
    public static readonly Guid BId = new("55555555-5555-5555-5555-555555555555");
}
