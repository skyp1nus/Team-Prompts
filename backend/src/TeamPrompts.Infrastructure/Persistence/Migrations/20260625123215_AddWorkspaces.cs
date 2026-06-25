using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamPrompts.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1) Create the Workspaces table first so the seed rows + FK targets exist.
            migrationBuilder.CreateTable(
                name: "Workspaces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Key = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    AvatarStorageKey = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: true),
                    AvatarContentType = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsSystem = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                });

            // 2) Seed the starting spaces: 4 channels (TT/T/G/B) + the non-deletable General catch-all.
            //    Fixed Guids (see WorkspaceDefaults) so existing data can be backfilled onto General below.
            var seededAt = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
            migrationBuilder.InsertData(
                table: "Workspaces",
                columns: new[] { "Id", "Name", "Key", "AvatarStorageKey", "AvatarContentType", "SortOrder", "IsSystem", "CreatedByUserId", "CreatedAt", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("22222222-2222-2222-2222-222222222222"), "TT", "TT", null, null, 1, false, "system", seededAt, seededAt },
                    { new Guid("33333333-3333-3333-3333-333333333333"), "T", "T", null, null, 2, false, "system", seededAt, seededAt },
                    { new Guid("44444444-4444-4444-4444-444444444444"), "G", "G", null, null, 3, false, "system", seededAt, seededAt },
                    { new Guid("55555555-5555-5555-5555-555555555555"), "B", "B", null, null, 4, false, "system", seededAt, seededAt },
                    { new Guid("11111111-1111-1111-1111-111111111111"), "General", null, null, null, 100, true, "system", seededAt, seededAt },
                });

            // 3) Add the FK columns. defaultValue = General → existing Scripts/Prompts backfill onto General.
            migrationBuilder.AddColumn<Guid>(
                name: "WorkspaceId",
                table: "Scripts",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("11111111-1111-1111-1111-111111111111"));

            migrationBuilder.AddColumn<Guid>(
                name: "WorkspaceId",
                table: "Prompts",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("11111111-1111-1111-1111-111111111111"));

            // 4) Drop the column default now that existing rows are backfilled — the model carries no
            //    default, so EF inserts always supply WorkspaceId and the schema matches the snapshot.
            migrationBuilder.Sql("ALTER TABLE \"Scripts\" ALTER COLUMN \"WorkspaceId\" DROP DEFAULT;");
            migrationBuilder.Sql("ALTER TABLE \"Prompts\" ALTER COLUMN \"WorkspaceId\" DROP DEFAULT;");

            migrationBuilder.CreateIndex(
                name: "IX_Scripts_WorkspaceId",
                table: "Scripts",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Prompts_WorkspaceId",
                table: "Prompts",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Workspaces_SortOrder",
                table: "Workspaces",
                column: "SortOrder");

            migrationBuilder.AddForeignKey(
                name: "FK_Prompts_Workspaces_WorkspaceId",
                table: "Prompts",
                column: "WorkspaceId",
                principalTable: "Workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Scripts_Workspaces_WorkspaceId",
                table: "Scripts",
                column: "WorkspaceId",
                principalTable: "Workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Prompts_Workspaces_WorkspaceId",
                table: "Prompts");

            migrationBuilder.DropForeignKey(
                name: "FK_Scripts_Workspaces_WorkspaceId",
                table: "Scripts");

            migrationBuilder.DropTable(
                name: "Workspaces");

            migrationBuilder.DropIndex(
                name: "IX_Scripts_WorkspaceId",
                table: "Scripts");

            migrationBuilder.DropIndex(
                name: "IX_Prompts_WorkspaceId",
                table: "Prompts");

            migrationBuilder.DropColumn(
                name: "WorkspaceId",
                table: "Scripts");

            migrationBuilder.DropColumn(
                name: "WorkspaceId",
                table: "Prompts");
        }
    }
}
