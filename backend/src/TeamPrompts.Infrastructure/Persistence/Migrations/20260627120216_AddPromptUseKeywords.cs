using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamPrompts.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPromptUseKeywords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "UseKeywords",
                table: "Prompts",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UseKeywords",
                table: "Prompts");
        }
    }
}
