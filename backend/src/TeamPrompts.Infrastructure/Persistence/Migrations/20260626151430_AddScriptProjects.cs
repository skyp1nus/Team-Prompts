using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamPrompts.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddScriptProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "Scripts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Model",
                table: "Scripts",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectId",
                table: "Scripts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourcePromptVersionId",
                table: "Scripts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceScriptId",
                table: "Scripts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VariantError",
                table: "Scripts",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VariantStatus",
                table: "Scripts",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "Prompts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // defaultValue 0 backfills existing rows (all Original / Metadata). Drop the column default
            // now so the schema matches the snapshot (the model carries no default — EF always supplies
            // Kind on insert). Same hygiene as AddWorkspaces' WorkspaceId backfill.
            migrationBuilder.Sql("ALTER TABLE \"Scripts\" ALTER COLUMN \"Kind\" DROP DEFAULT;");
            migrationBuilder.Sql("ALTER TABLE \"Prompts\" ALTER COLUMN \"Kind\" DROP DEFAULT;");

            migrationBuilder.CreateTable(
                name: "ScriptProjects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    OriginalScriptId = table.Column<Guid>(type: "uuid", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScriptProjects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScriptProjects_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Scripts_ProjectId",
                table: "Scripts",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Scripts_SourceScriptId",
                table: "Scripts",
                column: "SourceScriptId");

            migrationBuilder.CreateIndex(
                name: "IX_ScriptProjects_WorkspaceId",
                table: "ScriptProjects",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_ScriptProjects_WorkspaceId_SortOrder",
                table: "ScriptProjects",
                columns: new[] { "WorkspaceId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Scripts_ScriptProjects_ProjectId",
                table: "Scripts",
                column: "ProjectId",
                principalTable: "ScriptProjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Scripts_Scripts_SourceScriptId",
                table: "Scripts",
                column: "SourceScriptId",
                principalTable: "Scripts",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Scripts_ScriptProjects_ProjectId",
                table: "Scripts");

            migrationBuilder.DropForeignKey(
                name: "FK_Scripts_Scripts_SourceScriptId",
                table: "Scripts");

            migrationBuilder.DropTable(
                name: "ScriptProjects");

            migrationBuilder.DropIndex(
                name: "IX_Scripts_ProjectId",
                table: "Scripts");

            migrationBuilder.DropIndex(
                name: "IX_Scripts_SourceScriptId",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "Model",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "SourcePromptVersionId",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "SourceScriptId",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "VariantError",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "VariantStatus",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Prompts");
        }
    }
}
