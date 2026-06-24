using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamPrompts.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddResultHighlight : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "HighlightedAt",
                table: "GenerationResults",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HighlightedByUserId",
                table: "GenerationResults",
                type: "character varying(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsHighlighted",
                table: "GenerationResults",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HighlightedAt",
                table: "GenerationResults");

            migrationBuilder.DropColumn(
                name: "HighlightedByUserId",
                table: "GenerationResults");

            migrationBuilder.DropColumn(
                name: "IsHighlighted",
                table: "GenerationResults");
        }
    }
}
