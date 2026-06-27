/**
 * In-memory dev mock for the whole API — lets you log in and click through the
 * entire workspace (canvas, panels, tray, prompt panels, settings, forms) with
 * NO backend. Enabled only when NEXT_PUBLIC_MOCK === "1" (see `bun run dev:mock`).
 * Backend + generated client are untouched; this just short-circuits the axios
 * mutator. Not used in production builds.
 */
import type { AxiosRequestConfig } from "axios";
import type {
  GenerationResultDto,
  ModelDto,
  PromptDetailDto,
  PromptKind,
  PromptListItemDto,
  PromptVersionDto,
  ScriptDto,
  ScriptListItemDto,
  ScriptProjectDto,
  ScriptProjectListItemDto,
  SessionWithResultsDto,
  SettingsDto,
  TrayItemDto,
  UserDto,
  UserRef,
  WorkspaceDto,
} from "@/api/model";

export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

/* Workspace ids mirror the backend's seeded WorkspaceDefaults. */
const WS_GENERAL = "11111111-1111-1111-1111-111111111111";
const WS_TT = "22222222-2222-2222-2222-222222222222";
const WS_T = "33333333-3333-3333-3333-333333333333";
const WS_G = "44444444-4444-4444-4444-444444444444";
const WS_B = "55555555-5555-5555-5555-555555555555";

/* ----------------------------- seed helpers ----------------------------- */
let seq = 1;
const uid = (p: string) => `${p}${seq++}`;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const admin: UserDto = {
  id: "u1",
  email: "admin@teamprompts.local",
  displayName: "Mara A.",
  roles: ["Admin"],
};
const ref = (name: string): UserRef => ({ id: "u-" + name.split(" ")[0].toLowerCase(), displayName: name });

const MODELS: ModelDto[] = [
  { id: "openai/gpt-5", name: "GPT-5", description: null, isFree: false },
  { id: "openai/gpt-4o", name: "GPT-4o", description: null, isFree: false },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini", description: null, isFree: false },
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", description: null, isFree: false },
  { id: "openai/gpt-oss-120b:free", name: "gpt-oss-120b (free)", description: null, isFree: true },
  { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (free)", description: null, isFree: true },
];

const TITLE_POOL = [
  "The Desk Setup That Changed How I Work",
  "I Rebuilt My Desk in One Weekend",
  "This $1,200 Desk Beats a $5,000 One",
  "Stop Buying Desk Junk — Watch This First",
  "The Only Desk Setup Guide You Need",
  "My Desk Setup, Rebuilt From Zero",
  "The $200 Desk Glow-Up",
  "Calm Desk, Clear Head",
  "Why I Threw Out My Old Desk",
  "The Desk Upgrade Nobody Talks About",
  "I Tried 7 Desk Layouts — One Won",
  "The Cable Trick I Found Too Late",
];
const DESC_POOL = [
  "Build a focused desk setup the right way — full parts list, the budget order, and the upgrades worth your money. #desksetup #productivity #workspace",
  "Everything you need to plan a calm, clutter-free workspace, from desk and chair to cable management and lighting. #desksetup #homeoffice #focus",
  "Where to spend and where to save on your desk, broken down with real numbers and honest trade-offs. #desksetup #budgetsetup #review",
  "Go from cable chaos to a setup you actually enjoy sitting at. Full guide and parts list. #desksetup #ergonomics #setup",
];

function version(
  promptId: string,
  id: string,
  parent: string | null,
  author: string,
  daysAgo: number,
  note: string | null,
  content: string,
  isMain: boolean,
): PromptVersionDto {
  return { id, promptId, parentVersionId: parent, content, author: ref(author), note, isMain, createdAt: iso(daysAgo) };
}

type PromptRec = PromptDetailDto & { pool: "titles" | "desc"; workspaceId: string };
type ScriptRec = ScriptListItemDto & { workspaceId: string };
type ScriptProjectRec = {
  id: string;
  workspaceId: string;
  name: string;
  originalScriptId: string | null;
  sortOrder: number;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
  original: ScriptDto;
  variants: ScriptDto[];
  keywords?: ScriptDto | null;
};

/** Build a full ScriptDto (mock) with all the project/variant fields the rail reads. */
function scriptDtoFull(o: Partial<ScriptDto> & { id: string; name: string }): ScriptDto {
  return {
    id: o.id,
    name: o.name,
    originalFileName: o.originalFileName ?? "",
    fileType: o.fileType ?? "Txt",
    extractedText: o.extractedText ?? "Mock script text.",
    createdAt: o.createdAt ?? iso(1),
    updatedAt: o.updatedAt ?? iso(1),
    createdBy: o.createdBy ?? ref("Mara A."),
    projectId: o.projectId ?? null,
    kind: o.kind ?? "Original",
    sourceScriptId: o.sourceScriptId ?? null,
    sourcePromptVersionId: o.sourcePromptVersionId ?? null,
    model: o.model ?? null,
    variantStatus: o.variantStatus ?? null,
    variantError: o.variantError ?? null,
  };
}

function makeResults(
  sessionId: string,
  kind: "titles" | "desc",
  count: number,
  favIdx: number[] = [],
  hiIdx: number[] = [],
): GenerationResultDto[] {
  const pool = kind === "desc" ? DESC_POOL : TITLE_POOL;
  return Array.from({ length: count }).map((_, i) => ({
    id: `${sessionId}-${i}`,
    sessionId,
    index: i,
    content: pool[i % pool.length],
    kind: kind === "desc" ? "Description" : "Title",
    createdAt: iso(2),
    isFavorite: favIdx.includes(i),
    favoriteCount: favIdx.includes(i) ? 1 : 0,
    copyCount: 0,
    isHighlighted: hiIdx.includes(i),
    highlightedBy: hiIdx.includes(i) ? ref("Mara A.") : null,
    highlightedAt: hiIdx.includes(i) ? iso(1) : null,
  }));
}

function session(
  scriptId: string,
  prompt: PromptRec,
  model: string,
  count: number,
  favIdx: number[] = [],
  hiIdx: number[] = [],
): SessionWithResultsDto {
  const id = uid("s");
  return {
    session: {
      id,
      runId: null,
      scriptId,
      promptId: prompt.id,
      promptVersionId: prompt.mainVersionId ?? prompt.versions[0].id,
      promptName: prompt.name,
      model,
      status: "Completed",
      error: null,
      createdBy: ref("Mara A."),
      createdAt: iso(1),
      completedAt: iso(1),
      promptVersionNumber: prompt.versions.length,
      isMainVersion: true,
      promptVersionNote: null,
    },
    results: makeResults(id, prompt.pool, count, favIdx, hiIdx),
  };
}

/* ------------------------------- the store ------------------------------ */
function buildStore() {
  const workspaces: WorkspaceDto[] = [
    ws2(WS_TT, "TT", "TT", 1, false),
    ws2(WS_T, "T", "T", 2, false),
    ws2(WS_G, "G", "G", 3, false),
    ws2(WS_B, "B", "B", 4, false),
    ws2(WS_GENERAL, "General", null, 100, true),
  ];

  const scripts: ScriptRec[] = [
    sc("sc1", "Tutorial — Build a Desk Setup.pdf", "Pdf", 12, 4, WS_GENERAL),
    sc("sc2", "Vlog — Tokyo Day 3.txt", "Txt", 10, 0, WS_GENERAL),
    sc("sc3", "Review — Framework 16 Laptop.txt", "Txt", 8, 0, WS_TT),
    sc("sc4", "How We Color Grade in DaVinci.pdf", "Pdf", 5, 0, WS_T),
  ];

  const prompts: PromptRec[] = [
    prompt("p1", "Punchy Click Titles", "titles", WS_GENERAL, [
      ["v1", null, "Priya Raman", 17, "Initial draft", "Write 5 punchy YouTube titles for the script. Keep them under 60 characters.", false],
      ["v2", "v1", "Mara A.", 10, "Tightened wording, added a curiosity hook", "Write 5 punchy, high-CTR YouTube titles. Keep each under 55 characters. Use strong verbs, a clear payoff, and a light curiosity hook.", true],
      ["v3", "v2", "Tomás Vidal", 5, "Experiment: lead with a bold number", "Write 5 punchy, high-CTR YouTube titles. Lead with a bold, specific number or claim. Keep each under 55 characters.", false],
    ]),
    prompt("p2", "SEO Description Writer", "desc", WS_GENERAL, [
      ["v1", null, "Priya Raman", 16, "Initial draft", "Write a 3-sentence YouTube description optimized for search. Open with the core keyword and end with a soft CTA. Include 4 hashtags.", true],
    ]),
    prompt("p3", "Curiosity-Gap Titles", "titles", WS_TT, [
      ["v1", null, "Tomás Vidal", 15, "Initial draft", "Write 5 curiosity-gap YouTube titles. Hint at a payoff without revealing it.", false],
      ["v2", "v1", "Mara A.", 8, "Added specificity guidance", "Write 5 curiosity-gap YouTube titles. Anchor each in a concrete detail or number so it stays honest. Under 60 characters.", true],
    ]),
    prompt("p4", "Calm Educational Titles", "titles", WS_T, [
      ["v1", null, "Jules Bennett", 6, "Initial draft", "Write 5 calm, educational YouTube titles. Be clear and descriptive rather than sensational.", true],
    ]),
    prompt(
      "p5",
      "Condense to a вижимка",
      "titles",
      WS_GENERAL,
      [
        ["v1", null, "Mara A.", 9, "Initial draft", "Condense this video script into a tight ~150-word summary (вижимка) that keeps the key beats and the hook. Plain prose, ready to record.", true],
      ],
      "ScriptTransform",
    ),
  ];

  const prOriginal = scriptDtoFull({
    id: "prsc1",
    name: "Desk Setup Tutorial",
    originalFileName: "Desk Setup Tutorial.pdf",
    fileType: "Pdf",
    projectId: "pr1",
    kind: "Original",
    extractedText: "Full desk setup tutorial script…",
    createdAt: iso(3),
    updatedAt: iso(3),
  });
  const prVarDone = scriptDtoFull({
    id: "prsc2",
    name: "Condense to a вижимка",
    projectId: "pr1",
    kind: "Variant",
    sourceScriptId: "prsc1",
    sourcePromptVersionId: "p5v1",
    model: "anthropic/claude-3.7-sonnet",
    variantStatus: "Completed",
    extractedText: "A tight вижимка of the desk setup tutorial that keeps the hook and the budget order.",
    createdAt: iso(1),
    updatedAt: iso(1),
  });
  const prVarBusy = scriptDtoFull({
    id: "prsc3",
    name: "Energetic rewrite",
    projectId: "pr1",
    kind: "Variant",
    sourceScriptId: "prsc1",
    model: "openai/gpt-4o",
    variantStatus: "Streaming",
    extractedText: "",
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  // Every script lives in a project now — wrap each seed script in its own single-script project.
  const wrapProject = (s: ScriptRec, pid: string): ScriptProjectRec => ({
    id: pid,
    workspaceId: s.workspaceId,
    name: s.name,
    originalScriptId: s.id,
    sortOrder: 0,
    createdBy: ref("Mara A."),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    original: scriptDtoFull({
      id: s.id,
      name: s.name,
      originalFileName: s.originalFileName,
      fileType: s.fileType,
      projectId: pid,
      kind: "Original",
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }),
    variants: [],
  });

  const projects: ScriptProjectRec[] = [
    {
      id: "pr1",
      workspaceId: WS_GENERAL,
      name: "Desk Setup Tutorial",
      originalScriptId: "prsc1",
      sortOrder: -1,
      createdBy: ref("Mara A."),
      createdAt: iso(3),
      updatedAt: iso(0),
      original: prOriginal,
      variants: [prVarBusy, prVarDone],
    },
    ...scripts.map((s, i) => wrapProject(s, `wp${i + 1}`)),
  ];

  const sessionsByScript: Record<string, SessionWithResultsDto[]> = {
    sc1: [
      // Three runs of the same prompt+model → shows the horizontal "chain" layout (rope-linked runs).
      session("sc1", prompts[0], "anthropic/claude-3.7-sonnet", 5, [1], [1, 3]),
      session("sc1", prompts[0], "anthropic/claude-3.7-sonnet", 4, []),
      session("sc1", prompts[0], "anthropic/claude-3.7-sonnet", 3, []),
      session("sc1", prompts[0], "openai/gpt-4o", 5, []),
      session("sc1", prompts[1], "anthropic/claude-3.7-sonnet", 5, []),
      session("sc1", prompts[2], "anthropic/claude-3.7-sonnet", 5, [0], [0]),
      session("sc1", prompts[2], "openai/gpt-4o", 4, []),
    ],
    sc2: [],
    sc3: [],
    sc4: [],
  };

  return { workspaces, scripts, prompts, projects, sessionsByScript };
}

function ws2(id: string, name: string, key: string | null, sortOrder: number, isSystem: boolean): WorkspaceDto {
  return {
    id,
    name,
    key,
    avatarUrl: null,
    sortOrder,
    isSystem,
    scriptCount: 0,
    promptCount: 0,
    createdAt: iso(30),
    updatedAt: iso(30),
  };
}
function sc(id: string, name: string, fileType: "Pdf" | "Txt", daysAgo: number, sessionCount: number, workspaceId: string): ScriptRec {
  return {
    id,
    workspaceId,
    name,
    originalFileName: name,
    fileType,
    createdAt: iso(daysAgo),
    updatedAt: iso(daysAgo),
    createdBy: ref("Mara A."),
    sessionCount,
    projectId: null,
    kind: "Original",
  };
}
function prompt(
  id: string,
  name: string,
  kind: "titles" | "desc",
  workspaceId: string,
  vs: [string, string | null, string, number, string, string, boolean][],
  promptKind: PromptKind = "Metadata",
): PromptRec {
  const versions = vs.map(([vid, parent, author, days, note, content, isMain]) =>
    version(id, `${id}${vid}`, parent ? `${id}${parent}` : null, author, days, note, content, isMain),
  );
  const main = versions.find((v) => v.isMain) ?? versions[versions.length - 1];
  return {
    id,
    name,
    pool: kind,
    kind: promptKind,
    workspaceId,
    mainVersionId: main.id,
    createdBy: ref("Mara A."),
    createdAt: iso(17),
    updatedAt: iso(1),
    versions,
    useKeywords: false,
  };
}

const store = MOCK ? buildStore() : null!;

/* ------------------------------- responses ------------------------------ */
const reply = <T>(data: T, delay = 120): Promise<T> =>
  new Promise((res) => setTimeout(() => res(data), delay));

function findResult(id: string): GenerationResultDto | undefined {
  for (const list of Object.values(store.sessionsByScript))
    for (const s of list) {
      const r = s.results.find((x) => x.id === id);
      if (r) return r;
    }
  return undefined;
}

function trayFor(scriptId: string): TrayItemDto[] {
  const out: TrayItemDto[] = [];
  for (const s of store.sessionsByScript[scriptId] ?? [])
    for (const r of s.results)
      if (r.isFavorite)
        out.push({
          resultId: r.id,
          sessionId: s.session.id,
          content: r.content,
          kind: r.kind,
          promptName: s.session.promptName,
          model: s.session.model,
          createdAt: r.createdAt,
        });
  return out;
}

function listItem(p: PromptRec): PromptListItemDto {
  return {
    id: p.id,
    name: p.name,
    mainVersionId: p.mainVersionId,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    versionCount: p.versions.length,
    kind: p.kind,
    useKeywords: p.useKeywords,
  };
}

function projectListItem(p: ScriptProjectRec): ScriptProjectListItemDto {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    originalScriptId: p.originalScriptId,
    sortOrder: p.sortOrder,
    variantCount: p.variants.length,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function projectDto(p: ScriptProjectRec): ScriptProjectDto {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    originalScriptId: p.originalScriptId,
    sortOrder: p.sortOrder,
    original: p.original,
    variants: p.variants,
    keywords: p.keywords ?? null,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function defaultModel() {
  return "anthropic/claude-3.7-sonnet";
}

/** Returns a promise with mock data, or undefined to fall through to real axios. */
export function mockResponse(config: AxiosRequestConfig): Promise<unknown> | undefined {
  if (!MOCK) return undefined;
  const method = (config.method ?? "get").toUpperCase();
  const url = (config.url ?? "").split("?")[0];
  const body = (config.data ?? {}) as Record<string, unknown>;
  const m = (re: RegExp) => url.match(re);

  // auth
  if (url === "/api/auth/me" && method === "GET") return reply<UserDto>(admin);
  if (url === "/api/auth/login") return reply<UserDto>(admin, 200);
  if (url === "/api/auth/logout") return reply({}, 100);
  if (url === "/health") return reply({ status: "ok" });

  // workspaces
  if (url === "/api/workspaces" && method === "GET") {
    const list = [...store.workspaces]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((w) => ({
        ...w,
        scriptCount: store.scripts.filter((s) => s.workspaceId === w.id).length,
        promptCount: store.prompts.filter((p) => p.workspaceId === w.id).length,
      }));
    return reply<WorkspaceDto[]>(list);
  }
  if (url === "/api/workspaces" && method === "POST") {
    const id = uid("ws");
    const maxOrder = Math.max(0, ...store.workspaces.map((w) => w.sortOrder));
    const w: WorkspaceDto = {
      id,
      name: String(body.name ?? "Space"),
      key: (body.key as string) || null,
      avatarUrl: null,
      sortOrder: maxOrder + 1,
      isSystem: false,
      scriptCount: 0,
      promptCount: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    };
    store.workspaces.push(w);
    return reply(w, 200);
  }
  let wm = m(/^\/api\/workspaces\/([^/]+)\/avatar$/);
  if (wm && method === "POST") {
    const w = store.workspaces.find((x) => x.id === wm![1]);
    return reply(w ?? {}, 200);
  }
  wm = m(/^\/api\/workspaces\/([^/]+)$/);
  if (wm && method === "PUT") {
    const w = store.workspaces.find((x) => x.id === wm![1]);
    if (w) {
      if (body.name) w.name = String(body.name);
      w.key = (body.key as string) ?? null;
    }
    return reply(w ?? {}, 150);
  }
  if (wm && method === "DELETE") {
    const id = wm![1];
    store.scripts.forEach((s) => {
      if (s.workspaceId === id) s.workspaceId = WS_GENERAL;
    });
    store.prompts.forEach((p) => {
      if (p.workspaceId === id) p.workspaceId = WS_GENERAL;
    });
    store.workspaces = store.workspaces.filter((x) => x.id !== id);
    return reply({}, 150);
  }

  // scripts
  if (url === "/api/scripts" && method === "GET") {
    const params = (config.params ?? {}) as Record<string, unknown>;
    const q = String(params.search ?? "").toLowerCase();
    const wsId = params.workspaceId as string | undefined;
    let list = store.scripts;
    if (wsId) list = list.filter((s) => s.workspaceId === wsId);
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return reply<ScriptListItemDto[]>(list);
  }
  let mm = m(/^\/api\/scripts\/([^/]+)\/sessions$/);
  if (mm && method === "GET") return reply<SessionWithResultsDto[]>(store.sessionsByScript[mm[1]] ?? []);
  mm = m(/^\/api\/scripts\/([^/]+)\/tray$/);
  if (mm && method === "GET") return reply<TrayItemDto[]>(trayFor(mm[1]));
  mm = m(/^\/api\/scripts\/([^/]+)\/canvas$/);
  if (mm && method === "GET") return reply<unknown[]>([]);
  mm = m(/^\/api\/scripts\/([^/]+)$/);
  if (mm && method === "GET") {
    const id = mm[1];
    // A script id may be a loose script or a project's original/variant.
    for (const pr of store.projects) {
      const hit = pr.original.id === id ? pr.original : pr.variants.find((v) => v.id === id);
      if (hit) return reply<ScriptDto>(hit);
    }
    const s = store.scripts.find((x) => x.id === id);
    return reply<ScriptDto>(
      scriptDtoFull({
        id,
        name: s?.name ?? "Script",
        originalFileName: s?.originalFileName ?? "file",
        fileType: s?.fileType ?? "Txt",
        extractedText: "Mock extracted text.",
        createdAt: s?.createdAt,
        updatedAt: s?.updatedAt,
        projectId: s?.projectId ?? null,
        kind: s?.kind ?? "Original",
      }),
    );
  }
  if (mm && method === "DELETE") {
    store.scripts = store.scripts.filter((x) => x.id !== mm![1]);
    return reply({}, 150);
  }

  // script projects (folders: one Original + generated Variants)
  if (url === "/api/script-projects" && method === "GET") {
    const params = (config.params ?? {}) as Record<string, unknown>;
    const wsId = params.workspaceId as string | undefined;
    const q = String(params.search ?? "").toLowerCase();
    let list = store.projects;
    if (wsId) list = list.filter((p) => p.workspaceId === wsId);
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return reply<ScriptProjectListItemDto[]>(
      [...list].sort((a, b) => a.sortOrder - b.sortOrder).map(projectListItem),
    );
  }
  mm = m(/^\/api\/script-projects\/([^/]+)\/variants\/([^/]+)\/promote$/);
  if (mm && method === "POST") {
    const pr = store.projects.find((x) => x.id === mm![1]);
    if (pr) pr.originalScriptId = mm[2];
    return reply(pr ? projectDto(pr) : {}, 150);
  }
  mm = m(/^\/api\/script-projects\/([^/]+)\/variants\/([^/]+)$/);
  if (mm && method === "DELETE") {
    const pr = store.projects.find((x) => x.id === mm![1]);
    if (pr) {
      pr.variants = pr.variants.filter((v) => v.id !== mm![2]);
      if (pr.originalScriptId === mm[2]) pr.originalScriptId = pr.original.id;
    }
    return reply({}, 150);
  }
  mm = m(/^\/api\/script-projects\/([^/]+)\/variants$/);
  if (mm && method === "GET") {
    const pr = store.projects.find((x) => x.id === mm![1]);
    return reply<ScriptDto[]>(pr ? pr.variants : []);
  }
  if (mm && method === "POST") {
    const pr = store.projects.find((x) => x.id === mm![1]);
    if (!pr) return reply(null);
    const p = store.prompts.find((x) => x.id === String(body.promptId ?? ""));
    const variant = scriptDtoFull({
      id: uid("prsc"),
      name: String(body.name ?? p?.name ?? "Variant"),
      projectId: pr.id,
      kind: "Variant",
      sourceScriptId: pr.originalScriptId,
      sourcePromptVersionId: p?.mainVersionId ?? null,
      model: defaultModel(),
      variantStatus: "Completed",
      extractedText: "Freshly generated mock вижимка of the source script.",
      createdAt: iso(0),
      updatedAt: iso(0),
    });
    pr.variants.unshift(variant);
    pr.updatedAt = iso(0);
    return reply<ScriptDto>(variant, 250);
  }
  mm = m(/^\/api\/script-projects\/([^/]+)\/keywords$/);
  if (mm && method === "PUT") {
    const pr = store.projects.find((x) => x.id === mm![1]);
    if (pr) {
      pr.keywords = scriptDtoFull({
        id: pr.keywords?.id ?? uid("kw"),
        name: "Keywords",
        kind: "Keywords",
        projectId: pr.id,
        extractedText: String(body.content ?? ""),
      });
    }
    return reply(pr ? projectDto(pr) : {}, 150);
  }
  mm = m(/^\/api\/script-projects\/([^/]+)$/);
  if (mm && method === "GET") {
    const pr = store.projects.find((x) => x.id === mm![1]);
    return reply(pr ? projectDto(pr) : null);
  }
  if (mm && method === "PUT") {
    const pr = store.projects.find((x) => x.id === mm![1]);
    if (pr && body.name) pr.name = String(body.name);
    return reply(pr ? projectDto(pr) : {}, 150);
  }
  if (mm && method === "DELETE") {
    store.projects = store.projects.filter((x) => x.id !== mm![1]);
    return reply({}, 150);
  }

  // prompts
  if (url === "/api/prompts" && method === "GET") {
    const params = (config.params ?? {}) as Record<string, unknown>;
    const wsId = params.workspaceId as string | undefined;
    const kind = params.kind as PromptKind | undefined;
    let list = wsId ? store.prompts.filter((p) => p.workspaceId === wsId) : store.prompts;
    if (kind) list = list.filter((p) => p.kind === kind);
    return reply<PromptListItemDto[]>(list.map(listItem));
  }
  if (url === "/api/prompts" && method === "POST") {
    const id = uid("p");
    const vId = `${id}v1`;
    const rec: PromptRec = {
      id,
      name: String(body.name ?? "Untitled"),
      pool: /descr/i.test(String(body.name ?? "")) ? "desc" : "titles",
      kind: (body.kind as PromptKind) ?? "Metadata",
      workspaceId: String(body.workspaceId ?? WS_GENERAL),
      mainVersionId: vId,
      createdBy: ref("Mara A."),
      createdAt: iso(0),
      updatedAt: iso(0),
      versions: [version(id, vId, null, "Mara A.", 0, "Created prompt", String(body.content ?? ""), true)],
      useKeywords: Boolean(body.useKeywords),
    };
    store.prompts.push(rec);
    return reply(listItem(rec), 200);
  }
  mm = m(/^\/api\/prompts\/([^/]+)\/versions\/([^/]+)\/promote$/);
  if (mm && method === "POST") {
    const p = store.prompts.find((x) => x.id === mm![1]);
    if (p) {
      p.versions.forEach((v) => (v.isMain = v.id === mm![2]));
      p.mainVersionId = mm[2];
    }
    return reply({}, 180);
  }
  mm = m(/^\/api\/prompts\/([^/]+)\/versions$/);
  if (mm && method === "POST") {
    const p = store.prompts.find((x) => x.id === mm![1]);
    if (p) {
      const vId = uid(`${p.id}v`);
      p.versions.push(
        version(p.id, vId, String(body.parentVersionId ?? p.mainVersionId), "Mara A.", 0, (body.note as string) ?? null, String(body.content ?? ""), false),
      );
    }
    return reply({}, 200);
  }
  mm = m(/^\/api\/prompts\/([^/]+)$/);
  if (mm && method === "GET") {
    const p = store.prompts.find((x) => x.id === mm![1]);
    if (!p) return reply(null);
    const { pool: _pool, workspaceId: _ws, ...detail } = p;
    void _pool;
    void _ws;
    return reply<PromptDetailDto>(detail);
  }
  if (mm && method === "DELETE") {
    store.prompts = store.prompts.filter((x) => x.id !== mm![1]);
    return reply({}, 150);
  }
  if (mm && method === "PUT") {
    const p = store.prompts.find((x) => x.id === mm![1]);
    if (p && body.name) p.name = String(body.name);
    return reply({}, 150);
  }

  // generation
  if (url === "/api/generation" && method === "POST") {
    const scriptIds = (body.scriptIds as string[]) ?? [];
    // Body shape is now { prompts: [{ promptId, promptVersionId }] } (was promptIds: string[]).
    const prompts = (body.prompts as { promptId: string; promptVersionId: string | null }[]) ?? [];
    const model = (body.model as string) ?? defaultModel();
    scriptIds.forEach((sid) => {
      prompts.forEach(({ promptId }) => {
        const p = store.prompts.find((x) => x.id === promptId);
        if (!p) return;
        (store.sessionsByScript[sid] ??= []).push(session(sid, p, model, 5));
      });
    });
    return reply({}, 350);
  }
  mm = m(/^\/api\/generation\/sessions\/([^/]+)\/regenerate$/);
  if (mm && method === "POST") {
    for (const [sid, list] of Object.entries(store.sessionsByScript)) {
      const idx = list.findIndex((s) => s.session.id === mm![1]);
      if (idx >= 0) {
        const src = list[idx];
        const p = store.prompts.find((x) => x.id === src.session.promptId);
        const model = (body.model as string) ?? src.session.model;
        if (p) store.sessionsByScript[sid].push(session(sid, p, model, 5));
        break;
      }
    }
    return reply({}, 350);
  }
  mm = m(/^\/api\/generation\/sessions\/([^/]+)$/);
  if (mm && method === "GET") {
    for (const list of Object.values(store.sessionsByScript)) {
      const s = list.find((x) => x.session.id === mm![1]);
      if (s) return reply<SessionWithResultsDto>(s);
    }
    return reply(null);
  }

  // results
  mm = m(/^\/api\/results\/([^/]+)\/favorite$/);
  if (mm) {
    const r = findResult(mm[1]);
    if (r) {
      r.isFavorite = method === "POST";
      r.favoriteCount = Math.max(0, r.favoriteCount + (method === "POST" ? 1 : -1));
    }
    return reply({}, 120);
  }
  mm = m(/^\/api\/results\/([^/]+)\/highlight$/);
  if (mm) {
    const r = findResult(mm[1]);
    if (r) {
      const on = method === "POST";
      r.isHighlighted = on;
      r.highlightedBy = on ? ref("Mara A.") : null;
      r.highlightedAt = on ? iso(0) : null;
    }
    return reply({}, 120);
  }
  mm = m(/^\/api\/results\/([^/]+)\/copy$/);
  if (mm && method === "POST") {
    const r = findResult(mm[1]);
    if (r) r.copyCount += 1;
    return reply({}, 100);
  }

  // settings
  if (url === "/api/settings" && method === "GET")
    return reply<SettingsDto>({
      isApiKeySet: true,
      defaultModel: defaultModel(),
      favoriteModels: MODELS.slice(0, 2).map((m) => m.id),
      availableModels: MODELS,
    });
  if (url === "/api/settings/models" && method === "GET") return reply<ModelDto[]>(MODELS);
  if (url === "/api/settings/models/refresh") return reply<ModelDto[]>(MODELS, 300);
  if (url === "/api/settings/api-key") return reply({}, 200);
  if (url === "/api/settings/favorite-models") return reply({}, 200);

  // users
  if (url === "/api/users" && method === "POST") return reply({ id: uid("u"), ...body }, 250);
  if (url === "/api/users" && method === "GET") return reply([admin]);

  return undefined;
}

/** Mock for the hand-written multipart upload (bypasses the orval mutator). */
export function mockUpload(file: File, workspaceId: string, name?: string): Promise<ScriptDto> {
  const id = uid("sc");
  const ext = file.name.toLowerCase().endsWith(".pdf") ? "Pdf" : "Txt";
  store.scripts.unshift(sc(id, name ?? file.name, ext, 0, 0, workspaceId));
  store.sessionsByScript[id] = [];
  return reply<ScriptDto>(
    scriptDtoFull({
      id,
      name: name ?? file.name,
      originalFileName: file.name,
      fileType: ext,
      extractedText: "Mock extracted text.",
      createdAt: iso(0),
      updatedAt: iso(0),
    }),
    250,
  );
}

/** Mock for the hand-written multipart "create project from upload" (bypasses the orval mutator). */
export function mockCreateProject(file: File, workspaceId: string, name?: string): Promise<ScriptProjectDto> {
  const pid = uid("pr");
  const ext = file.name.toLowerCase().endsWith(".pdf") ? "Pdf" : "Txt";
  const original = scriptDtoFull({
    id: uid("prsc"),
    name: name ?? file.name,
    originalFileName: file.name,
    fileType: ext,
    projectId: pid,
    kind: "Original",
    extractedText: "Mock extracted text.",
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  const rec: ScriptProjectRec = {
    id: pid,
    workspaceId,
    name: name ?? file.name,
    originalScriptId: original.id,
    sortOrder: -1,
    createdBy: ref("Mara A."),
    createdAt: iso(0),
    updatedAt: iso(0),
    original,
    variants: [],
  };
  store.projects.unshift(rec);
  return reply<ScriptProjectDto>(projectDto(rec), 250);
}
