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
  PromptListItemDto,
  PromptVersionDto,
  ScriptDto,
  ScriptListItemDto,
  SessionWithResultsDto,
  SettingsDto,
  TrayItemDto,
  UserDto,
  UserRef,
} from "@/api/model";

export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

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

type PromptRec = PromptDetailDto & { kind: "titles" | "desc" };

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
    results: makeResults(id, prompt.kind, count, favIdx, hiIdx),
  };
}

/* ------------------------------- the store ------------------------------ */
function buildStore() {
  const scripts: ScriptListItemDto[] = [
    sc("sc1", "Tutorial — Build a Desk Setup.pdf", "Pdf", 12, 4),
    sc("sc2", "Vlog — Tokyo Day 3.txt", "Txt", 10, 0),
    sc("sc3", "Review — Framework 16 Laptop.txt", "Txt", 8, 0),
    sc("sc4", "How We Color Grade in DaVinci.pdf", "Pdf", 5, 0),
  ];

  const prompts: PromptRec[] = [
    prompt("p1", "Punchy Click Titles", "titles", [
      ["v1", null, "Priya Raman", 17, "Initial draft", "Write 5 punchy YouTube titles for the script. Keep them under 60 characters.", false],
      ["v2", "v1", "Mara A.", 10, "Tightened wording, added a curiosity hook", "Write 5 punchy, high-CTR YouTube titles. Keep each under 55 characters. Use strong verbs, a clear payoff, and a light curiosity hook.", true],
      ["v3", "v2", "Tomás Vidal", 5, "Experiment: lead with a bold number", "Write 5 punchy, high-CTR YouTube titles. Lead with a bold, specific number or claim. Keep each under 55 characters.", false],
    ]),
    prompt("p2", "SEO Description Writer", "desc", [
      ["v1", null, "Priya Raman", 16, "Initial draft", "Write a 3-sentence YouTube description optimized for search. Open with the core keyword and end with a soft CTA. Include 4 hashtags.", true],
    ]),
    prompt("p3", "Curiosity-Gap Titles", "titles", [
      ["v1", null, "Tomás Vidal", 15, "Initial draft", "Write 5 curiosity-gap YouTube titles. Hint at a payoff without revealing it.", false],
      ["v2", "v1", "Mara A.", 8, "Added specificity guidance", "Write 5 curiosity-gap YouTube titles. Anchor each in a concrete detail or number so it stays honest. Under 60 characters.", true],
    ]),
    prompt("p4", "Calm Educational Titles", "titles", [
      ["v1", null, "Jules Bennett", 6, "Initial draft", "Write 5 calm, educational YouTube titles. Be clear and descriptive rather than sensational.", true],
    ]),
  ];

  const sessionsByScript: Record<string, SessionWithResultsDto[]> = {
    sc1: [
      session("sc1", prompts[0], "anthropic/claude-3.7-sonnet", 5, [1], [1, 3]),
      session("sc1", prompts[0], "openai/gpt-4o", 5, []),
      session("sc1", prompts[1], "anthropic/claude-3.7-sonnet", 5, []),
      session("sc1", prompts[2], "anthropic/claude-3.7-sonnet", 5, [0], [0]),
      session("sc1", prompts[2], "openai/gpt-4o", 4, []),
    ],
    sc2: [],
    sc3: [],
    sc4: [],
  };

  return { scripts, prompts, sessionsByScript };
}

function sc(id: string, name: string, fileType: "Pdf" | "Txt", daysAgo: number, sessionCount: number): ScriptListItemDto {
  return {
    id,
    name,
    originalFileName: name,
    fileType,
    createdAt: iso(daysAgo),
    updatedAt: iso(daysAgo),
    createdBy: ref("Mara A."),
    sessionCount,
  };
}
function prompt(
  id: string,
  name: string,
  kind: "titles" | "desc",
  vs: [string, string | null, string, number, string, string, boolean][],
): PromptRec {
  const versions = vs.map(([vid, parent, author, days, note, content, isMain]) =>
    version(id, `${id}${vid}`, parent ? `${id}${parent}` : null, author, days, note, content, isMain),
  );
  const main = versions.find((v) => v.isMain) ?? versions[versions.length - 1];
  return {
    id,
    name,
    kind,
    mainVersionId: main.id,
    createdBy: ref("Mara A."),
    createdAt: iso(17),
    updatedAt: iso(1),
    versions,
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

  // scripts
  if (url === "/api/scripts" && method === "GET") {
    const q = String((config.params as Record<string, unknown>)?.search ?? "").toLowerCase();
    return reply<ScriptListItemDto[]>(
      q ? store.scripts.filter((s) => s.name.toLowerCase().includes(q)) : store.scripts,
    );
  }
  let mm = m(/^\/api\/scripts\/([^/]+)\/sessions$/);
  if (mm && method === "GET") return reply<SessionWithResultsDto[]>(store.sessionsByScript[mm[1]] ?? []);
  mm = m(/^\/api\/scripts\/([^/]+)\/tray$/);
  if (mm && method === "GET") return reply<TrayItemDto[]>(trayFor(mm[1]));
  mm = m(/^\/api\/scripts\/([^/]+)\/canvas$/);
  if (mm && method === "GET") return reply<unknown[]>([]);
  mm = m(/^\/api\/scripts\/([^/]+)$/);
  if (mm && method === "GET") {
    const s = store.scripts.find((x) => x.id === mm![1]);
    return reply<ScriptDto>({
      id: mm[1],
      name: s?.name ?? "Script",
      originalFileName: s?.originalFileName ?? "file",
      fileType: s?.fileType ?? "Txt",
      extractedText: "Mock extracted text.",
      storageKey: "mock",
      createdAt: s?.createdAt ?? iso(1),
      updatedAt: s?.updatedAt ?? iso(1),
      createdBy: ref("Mara A."),
    } as unknown as ScriptDto);
  }
  if (mm && method === "DELETE") {
    store.scripts = store.scripts.filter((x) => x.id !== mm![1]);
    return reply({}, 150);
  }

  // prompts
  if (url === "/api/prompts" && method === "GET") return reply<PromptListItemDto[]>(store.prompts.map(listItem));
  if (url === "/api/prompts" && method === "POST") {
    const id = uid("p");
    const vId = `${id}v1`;
    const rec: PromptRec = {
      id,
      name: String(body.name ?? "Untitled"),
      kind: /descr/i.test(String(body.name ?? "")) ? "desc" : "titles",
      mainVersionId: vId,
      createdBy: ref("Mara A."),
      createdAt: iso(0),
      updatedAt: iso(0),
      versions: [version(id, vId, null, "Mara A.", 0, "Created prompt", String(body.content ?? ""), true)],
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
    const { kind: _kind, ...detail } = p;
    void _kind;
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
export function mockUpload(file: File, name?: string): Promise<ScriptDto> {
  const id = uid("sc");
  const ext = file.name.toLowerCase().endsWith(".pdf") ? "Pdf" : "Txt";
  store.scripts.unshift(sc(id, name ?? file.name, ext, 0, 0));
  store.sessionsByScript[id] = [];
  return reply<ScriptDto>({
    id,
    name: name ?? file.name,
    originalFileName: file.name,
    fileType: ext,
    extractedText: "Mock extracted text.",
    storageKey: "mock",
    createdAt: iso(0),
    updatedAt: iso(0),
    createdBy: ref("Mara A."),
  } as unknown as ScriptDto, 250);
}
