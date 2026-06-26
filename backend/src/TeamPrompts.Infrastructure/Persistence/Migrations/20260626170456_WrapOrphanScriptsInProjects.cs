using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamPrompts.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WrapOrphanScriptsInProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every script now lives inside a project folder — there are no "ungrouped" scripts. Wrap
            // each pre-existing Original script (ProjectId NULL) in its own single-script project, with
            // the project pointing back at it as the OriginalScript. One CTE: insert the projects, then
            // repoint the scripts onto them by the OriginalScriptId we just stored.
            migrationBuilder.Sql(
                """
                WITH ins AS (
                    INSERT INTO "ScriptProjects"
                        ("Id", "WorkspaceId", "Name", "OriginalScriptId", "SortOrder",
                         "CreatedByUserId", "CreatedAt", "UpdatedAt")
                    SELECT gen_random_uuid(), s."WorkspaceId", s."Name", s."Id", 0,
                           s."CreatedByUserId", s."CreatedAt", s."UpdatedAt"
                    FROM "Scripts" s
                    WHERE s."ProjectId" IS NULL AND s."Kind" = 0
                    RETURNING "Id", "OriginalScriptId"
                )
                UPDATE "Scripts" s
                SET "ProjectId" = ins."Id"
                FROM ins
                WHERE s."Id" = ins."OriginalScriptId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Detach the auto-wrapped scripts and drop the single-script projects we created.
            migrationBuilder.Sql(
                """
                UPDATE "Scripts" s
                SET "ProjectId" = NULL
                FROM "ScriptProjects" p
                WHERE s."ProjectId" = p."Id"
                  AND p."OriginalScriptId" = s."Id"
                  AND NOT EXISTS (
                      SELECT 1 FROM "Scripts" v
                      WHERE v."ProjectId" = p."Id" AND v."Kind" = 1
                  );

                DELETE FROM "ScriptProjects" p
                WHERE NOT EXISTS (
                    SELECT 1 FROM "Scripts" s WHERE s."ProjectId" = p."Id"
                );
                """);
        }
    }
}
