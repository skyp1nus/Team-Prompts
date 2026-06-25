using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamPrompts.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPromptSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Prompts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Seed a stable order from the prior newest-first display (per workspace, 0-based) so the
            // library opens exactly as it did before — distinct values, ready to drag-reorder.
            migrationBuilder.Sql(
                """
                UPDATE "Prompts" AS p
                SET "SortOrder" = sub.rn
                FROM (
                    SELECT "Id",
                           row_number() OVER (PARTITION BY "WorkspaceId" ORDER BY "UpdatedAt" DESC) - 1 AS rn
                    FROM "Prompts"
                ) AS sub
                WHERE p."Id" = sub."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Prompts_WorkspaceId_SortOrder",
                table: "Prompts",
                columns: new[] { "WorkspaceId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Prompts_WorkspaceId_SortOrder",
                table: "Prompts");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "Prompts");
        }
    }
}
