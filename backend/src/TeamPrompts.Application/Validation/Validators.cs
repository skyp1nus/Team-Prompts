using FluentValidation;
using TeamPrompts.Application.Dtos;

namespace TeamPrompts.Application.Validation;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    private static readonly string[] Roles = ["Owner", "Admin", "Member"];

    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(6);
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Role).Must(r => Roles.Contains(r)).WithMessage("Role must be Owner, Admin or Member.");
    }
}

public sealed class UpdateScriptRequestValidator : AbstractValidator<UpdateScriptRequest>
{
    public UpdateScriptRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(300);
}

public sealed class CreateWorkspaceRequestValidator : AbstractValidator<CreateWorkspaceRequest>
{
    public CreateWorkspaceRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Key).MaximumLength(10);
    }
}

public sealed class UpdateWorkspaceRequestValidator : AbstractValidator<UpdateWorkspaceRequest>
{
    public UpdateWorkspaceRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Key).MaximumLength(10);
    }
}

public sealed class CreatePromptRequestValidator : AbstractValidator<CreatePromptRequest>
{
    public CreatePromptRequestValidator()
    {
        RuleFor(x => x.WorkspaceId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(300);
        RuleFor(x => x.Content).NotEmpty();
    }
}

public sealed class UpdatePromptRequestValidator : AbstractValidator<UpdatePromptRequest>
{
    public UpdatePromptRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(300);
}

public sealed class ReorderPromptsRequestValidator : AbstractValidator<ReorderPromptsRequest>
{
    public ReorderPromptsRequestValidator()
    {
        RuleFor(x => x.WorkspaceId).NotEmpty();
        RuleFor(x => x.OrderedIds).NotNull();
        RuleForEach(x => x.OrderedIds).NotEmpty();
    }
}

public sealed class CreateVersionRequestValidator : AbstractValidator<CreateVersionRequest>
{
    public CreateVersionRequestValidator()
    {
        RuleFor(x => x.ParentVersionId).NotEmpty();
        RuleFor(x => x.Content).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(1000);
    }
}

public sealed class CreateGenerationRequestValidator : AbstractValidator<CreateGenerationRequest>
{
    public CreateGenerationRequestValidator()
    {
        RuleFor(x => x.ScriptIds).NotEmpty().WithMessage("Select at least one script.");
        RuleFor(x => x.Prompts).NotEmpty().WithMessage("Select at least one prompt.");
        RuleForEach(x => x.Prompts).ChildRules(p => p.RuleFor(c => c.PromptId).NotEmpty());
        RuleFor(x => x.VariantCount).InclusiveBetween(1, 10).When(x => x.VariantCount.HasValue);
    }
}

public sealed class SaveCanvasRequestValidator : AbstractValidator<SaveCanvasRequest>
{
    public SaveCanvasRequestValidator()
    {
        RuleFor(x => x.Nodes).NotNull();
        RuleForEach(x => x.Nodes).ChildRules(n =>
            n.RuleFor(c => c.NodeKey).NotEmpty().MaximumLength(200));
    }
}

public sealed class SetApiKeyRequestValidator : AbstractValidator<SetApiKeyRequest>
{
    public SetApiKeyRequestValidator() => RuleFor(x => x.ApiKey).NotEmpty();
}

public sealed class SetFavoriteModelsRequestValidator : AbstractValidator<SetFavoriteModelsRequest>
{
    public SetFavoriteModelsRequestValidator()
    {
        RuleFor(x => x.Models).NotNull();
        RuleForEach(x => x.Models).NotEmpty().MaximumLength(200);
    }
}
