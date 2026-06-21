using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamPrompts.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddActivityLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ActivityEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    ActorUserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Summary = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    TargetType = table.Column<int>(type: "integer", nullable: true),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetUserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: true),
                    Model = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PromptTokens = table.Column<int>(type: "integer", nullable: true),
                    CompletionTokens = table.Column<int>(type: "integer", nullable: true),
                    TotalTokens = table.Column<int>(type: "integer", nullable: true),
                    CostUsd = table.Column<decimal>(type: "numeric(12,6)", nullable: true),
                    Metadata = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivityEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActivityEvents_ActorUserId",
                table: "ActivityEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ActivityEvents_CreatedAt",
                table: "ActivityEvents",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ActivityEvents_TargetType_TargetId",
                table: "ActivityEvents",
                columns: new[] { "TargetType", "TargetId" });

            migrationBuilder.CreateIndex(
                name: "IX_ActivityEvents_Type",
                table: "ActivityEvents",
                column: "Type");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActivityEvents");
        }
    }
}
