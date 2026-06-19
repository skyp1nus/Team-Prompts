using Microsoft.EntityFrameworkCore;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Application.Dtos;
using TeamPrompts.Infrastructure.Persistence;

namespace TeamPrompts.Infrastructure.Identity;

public sealed class UserDirectory(AppDbContext db) : IUserDirectory
{
    public async Task<IReadOnlyDictionary<string, UserRef>> GetAsync(IEnumerable<string> userIds, CancellationToken ct = default)
    {
        var ids = userIds.Where(id => !string.IsNullOrEmpty(id)).Distinct().ToList();
        if (ids.Count == 0)
            return new Dictionary<string, UserRef>();

        return await db.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => new UserRef(u.Id, u.DisplayName, u.Email), ct);
    }
}
