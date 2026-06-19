/**
 * Seed data for the Teams + Activity screens (ported from the canonical design).
 * These two screens are backend-deferred (no API endpoints yet), so they run as
 * FE-only preview pages with local state. See [[team-prompts-deferred-scope]].
 */

export type Role = "Owner" | "Admin" | "Editor" | "Viewer";
export const ROLES: Role[] = ["Owner", "Admin", "Editor", "Viewer"];

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited";
};

export type ActivityEntry = {
  id: string;
  who: string;
  tag: "Generate" | "Edit" | "Branch" | "Promote" | "Member" | "Role";
  accent?: boolean;
  what: string;
  target: string;
  detail: string;
  when: string;
};

export const ACTIVITY_TYPES = ["all", "Generate", "Edit", "Branch", "Promote", "Member", "Role"] as const;

export const SEED_MEMBERS: Member[] = [
  { id: "m1", name: "Mara A.", email: "mara@studio.tv", role: "Owner", status: "active" },
  { id: "m2", name: "Devin Osei", email: "devin@studio.tv", role: "Admin", status: "active" },
  { id: "m3", name: "Priya Raman", email: "priya@studio.tv", role: "Editor", status: "active" },
  { id: "m4", name: "Tomás Vidal", email: "tomas@studio.tv", role: "Editor", status: "active" },
  { id: "m5", name: "Jules Bennett", email: "jules@studio.tv", role: "Editor", status: "active" },
  { id: "m6", name: "Sora Kimura", email: "sora@studio.tv", role: "Viewer", status: "active" },
  { id: "m7", name: "Ben Whitfield", email: "ben@studio.tv", role: "Viewer", status: "invited" },
];

export const SEED_ACTIVITY: ActivityEntry[] = [
  { id: "a1", who: "Mara A.", tag: "Promote", accent: true, what: "promoted", target: "Punchy Click Titles v2", detail: "to Main", when: "Today · 09:42" },
  { id: "a2", who: "Tomás Vidal", tag: "Branch", what: "branched", target: "Punchy Click Titles", detail: "→ stronger-hooks", when: "Today · 09:31" },
  { id: "a3", who: "Mara A.", tag: "Generate", what: "ran a generation on", target: "Curiosity-Gap Titles", detail: "Build a Desk Setup · 5 variants", when: "Today · 09:18" },
  { id: "a4", who: "Priya Raman", tag: "Generate", what: "ran a generation on", target: "Punchy Click Titles", detail: "Tokyo Day 3 · 6 variants", when: "Yesterday · 17:50" },
  { id: "a5", who: "Jules Bennett", tag: "Branch", what: "branched", target: "Punchy Click Titles", detail: "→ tighter", when: "Yesterday · 16:12" },
  { id: "a6", who: "Devin Osei", tag: "Member", what: "invited", target: "Ben Whitfield", detail: "as Viewer", when: "Yesterday · 14:03" },
  { id: "a7", who: "Mara A.", tag: "Edit", what: "edited", target: "Curiosity-Gap Titles v2", detail: "added specificity guidance", when: "Jun 11 · 11:27" },
  { id: "a8", who: "Devin Osei", tag: "Role", what: "changed role of", target: "Priya Raman", detail: "Viewer → Editor", when: "Jun 10 · 10:05" },
  { id: "a9", who: "Priya Raman", tag: "Edit", what: "edited", target: "Punchy Click Titles v2", detail: "tightened wording", when: "Jun 9 · 15:44" },
  { id: "a10", who: "Sora Kimura", tag: "Generate", what: "ran a generation on", target: "SEO Description Writer", detail: "Framework 16 · 4 variants", when: "Jun 8 · 13:20" },
  { id: "a11", who: "Mara A.", tag: "Member", what: "added", target: "Sora Kimura", detail: "as Viewer", when: "Jun 6 · 09:00" },
  { id: "a12", who: "Tomás Vidal", tag: "Edit", what: "created prompt", target: "Curiosity-Gap Titles", detail: "first version", when: "Jun 4 · 16:30" },
];

export function memberInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
