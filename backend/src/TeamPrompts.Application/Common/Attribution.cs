using TeamPrompts.Application.Dtos;

namespace TeamPrompts.Application.Common;

public static class Attribution
{
    public static UserRef Of(IReadOnlyDictionary<string, UserRef> dir, string id) =>
        dir.GetValueOrDefault(id) ?? new UserRef(id, "Unknown");
}
