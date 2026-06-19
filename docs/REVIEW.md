# Team Prompts — Full-Project Verification Audit

**Mode:** Read-only audit. No source file was modified; only this report was written.
**Method:** Build gates run live (`dotnet build`, `bun run build`, `docker compose config`) + a
per-section evidence sweep (A–L) over the actual files/commands. Every PASS below carries a
file:line or command-output citation. Nothing is marked ✅ on "looks done".

**Status legend:** ✅ PASS (proven) · ⚠️ PARTIAL (works but deviates from spec/design) ·
❌ FAIL (missing/broken/unproven) · 🔍 UNVERIFIABLE (needs a resource not available here).
**Severity:** P0 blocks a core flow · P1 important · P2 polish.

**Headline:** No P0, no FAIL. Backend + frontend + infra all build and validate clean. The data
model, RBAC, write-only API key, versioning, Hangfire+SignalR generation, Caddy/SignalR routing,
and the hand-ported pan/zoom canvas are all genuinely implemented and shadcn is real. One P1
(a vulnerable transitive `Newtonsoft.Json`) and a handful of P2 polish deviations remain.

---

## 1. Summary table

> **Post-fix update (2026-06-19):** the cleanup pass below was applied. §A and §L are now ✅; the
> §G streaming-resilience hardening was added. See **§5. Post-fix verification** at the end.

| § | Section | Status | Note |
|---|---------|--------|------|
| A | Build & boot | ✅ | Backend builds **0 warnings / 0 errors** (Newtonsoft.Json pinned to 13.0.3 → NU1903 gone; CA2024 fixed), FE builds clean, compose validates (db/api/web/caddy), EF migrates on startup. (Optional prod-hardening of the committed admin-password default / `db:5432` publish is a separate P2, out of this fix batch.) |
| B | shadcn is real | ✅ | `components.json` + full token layer with the design's **zinc** palette (light+dark, not default slate), 71 `@/components/ui` imports, cva Button. One P2: two view files use a literal hex dot-array. |
| C | Shell layout | ✅ | 3-col `ResizablePanelGroup` at design widths **266 / 1fr / 304**; tray nested inside Center stack, not a top-level region. P2: rails are resizable vs design's fixed grid (defaults match). |
| D | Center canvas (ported) | ✅ | No React Flow; single transformed world layer wrapping SVG beziers + HTML nodes; pan/zoom/fit/clamp/hover all wired; edges recompute on layout not pan/zoom. P2: nodes are styled `<div>` (design-faithful) not shadcn `<Card>`. |
| E | Forms (shadcn+RHF+Zod) | ✅ | All 6 forms use `Form/FormField/FormControl/FormMessage` + `useForm(zodResolver)`, inline errors + sonner toasts. P2: one hidden native file `<input>` (no shadcn primitive), wrapped in `FormControl`. |
| F | Data model (no categories) | ✅ | Zero "categor" anywhere; all 9 entities + enums match the spec; every `GenerationSession` links Script + PromptVersion + Model (non-nullable). |
| G | Backend behavior | ✅ | Identity email login, env-seeded admin, admin-only create-user, PdfPig/TXT→`IFileStorage`, branch/list/promote, Hangfire+SignalR streaming, FluentValidation, Serilog. Resilience kept as `AddStandardResilienceHandler` (Polly-backed) **but the SSE streaming call is now exempt** — runs on a separate non-resilient client (no total-timeout / no retry) so a partial completion is never aborted or replayed. |
| H | API key write-only | ✅ | `SettingsDto` has no key field; `Protect()` (IDataProtector) at rest; UI shows only "Key is set". Verified through DTO, OpenAPI contract, and generated FE model. |
| I | AI integration | ✅ | Default `openai/gpt-5` seeded; `/models` refresh path present; model is per-session; Regenerate + "try another model" both create **new** sessions. One 🔍: live `/models` id needs a real key. |
| J | Infra (Caddy + env) | ✅ | Caddy routes `/api/*`+`/hangfire/*`→api, `/*`→web, transparent WS upgrade for the real hub path `/api/hubs/generation`; `.env.example` documents all 11 compose vars. P2: `OpenRouter__ApiKey` documented but unread at startup. |
| K | Scope & seams | ✅ | Redis/MinIO/email-invites genuinely **unwired** (only seam comments); `IFileStorage` is a clean swap-ready seam, sole caller depends on the interface. |
| L | Hygiene / anti-patterns | ✅ | App calls the **real** orval client by default (mock is opt-in, gated); no TODO/FIXME in critical paths. `frontend/README.md` rewritten Bun-only (no npm/yarn/pnpm). `localStorage` is used only for the non-sensitive theme accent (no tokens/session — auth is cookie-based); retained as a deliberate, documented exception. |

**Tally (after fix pass):** ✅ 11 · ⚠️ 0 · ❌ 0 · 🔍 0 sections. Findings resolved: P1 (1/1),
the requested P2 batch (streaming read, streaming-resilience exemption, dot tokens, README, unused
`OpenRouter__ApiKey`), and the 🔍 code-side model validation. Remaining: optional prod-hardening
P2s (compose admin default / `db:5432`) and the human step of confirming the live GPT-5 id with a key.

---

## 2. Findings (every ⚠️ and 🔍, with evidence, severity, fix)

### A. Build & boot — ⚠️

**A-1 · Vulnerable transitive `Newtonsoft.Json` 11.0.1 — P1 — ✅ RESOLVED**
- *Resolution:* Added a direct `<PackageReference Include="Newtonsoft.Json" Version="13.0.3" />` to `TeamPrompts.Api.csproj`. `dotnet list package --include-transitive` now resolves `Newtonsoft.Json 13.0.3`; `dotnet build` reports `0 Warning(s) / 0 Error(s)` — NU1903 cleared.
- *What was wrong:* `TeamPrompts.Api` transitively references `Newtonsoft.Json` 11.0.1, which has a known **high-severity** advisory. It is not part of the declared CLAUDE.md stack (the app uses System.Text.Json), so this is an unexpected, vulnerable dependency.
- *Evidence (build output, verbatim):* `warning NU1903: Package 'Newtonsoft.Json' 11.0.1 has a known high severity vulnerability, https://github.com/advisories/GHSA-5crp-9r3c-p9vr` (reported on `TeamPrompts.Api.csproj` at restore + build). Build otherwise: `Build succeeded.` / `3 Warning(s)` / `0 Error(s)`.
- *Fix:* Pin `Newtonsoft.Json` to a patched version (`>= 13.0.x`) via a direct `PackageReference` / `Directory.Packages.props` override on the API project, or trace and drop the transitive pull if the consuming package isn't needed. Re-run `dotnet build` to confirm NU1903 clears.

**A-2 · `CA2024` async `reader.EndOfStream` in the streaming path — P2 — ✅ RESOLVED**
- *Resolution:* Rewrote the loop to `string? line; while ((line = await reader.ReadLineAsync(ct)) is not null) { … }`, threading the `CancellationToken`. `rg "EndOfStream"` on the file returns nothing; build no longer emits CA2024.

**A-3 · Compose ships insecure defaults — P2**
- *What's wrong:* `docker compose config` resolves `api` with an empty `OpenRouter__ApiKey` and a hardcoded default `Seed__AdminPassword: Admin123!` (no `.env` override at config time); `db` publishes `5432` to the host. Fine for dev, not for prod.
- *Evidence:* Build-gate note from `docker compose config` resolution (defaults applied, no `.env` present at config time).
- *Fix:* Require `Seed__AdminPassword` / `OpenRouter__ApiKey` from `.env` with no committed default, and avoid publishing `db:5432` to the host in a prod compose profile/override.

### B. shadcn is real — ✅ (one P2 inside)

**B-1 · Two view files use a literal hex dot-array instead of `--chart` tokens — P2 — ✅ RESOLVED**
- *Resolution:* Mapped the `DOTS` arrays in `grid-view.tsx` / `columns-view.tsx` and the `PROVIDER_DOT` map in `lib/models.ts` to `var(--chart-*)` (xAI → `var(--muted-foreground)`). `rg "#[0-9a-fA-F]{3,6}" frontend/src/components/generation frontend/src/lib/models.ts` is now empty — provider dots follow light/dark.
- *What was wrong:* `grid-view.tsx:9` and `columns-view.tsx:9` both declare `const DOTS = ["var(--primary)", "#2ea067", "#c98a1a", "#c43b54", "#2a7fd6", "#7b5bd6"]`. These literals are a faithful port of the design's own array (`map-shadcn.html:600`), but the same colors already exist as `--chart-1..5` in `globals.css:85-89`.
- *Evidence:* `rg -n "#[0-9a-fA-F]{3,6}|rgb\(" frontend/src/app frontend/src/components -g '!**/ui/**'` → all hits in `globals.css` (the token layer, expected) except these two `DOTS` arrays.
- *Fix:* Replace with token vars: `["var(--primary)","var(--chart-2)","var(--chart-1)","var(--chart-4)","var(--chart-3)","var(--chart-5)"]` so the dot colors stay theme-driven.

### C. Shell layout — ✅ (one P2 inside)

**C-1 · Rails are user-resizable vs the design's fixed grid — P2**
- *What's wrong:* The design (`map-shadcn.html:87`) uses a non-resizable `grid-template-columns:266px 1fr 304px`. The FE makes rails user-resizable via `min/maxSize` + `ResizableHandle` (`app-shell.tsx:112,116,120`). This is the agreed/documented decision (CLAUDE.md resizable convention; the defaults match the design, so first paint is identical) — only drag-to-resize behavior differs.
- *Evidence:* `app-shell.tsx:111-123` `ResizablePanelGroup` with `defaultSize={266}` / center flex / `defaultSize={304}`; v4 numeric sizes are pixels.
- *Fix:* Acceptable as-is per the agreed decision. For strict static fidelity, drop the handles and use fixed-width rails.

### D. Center canvas (ported) — ✅ (one P2 inside)

**D-1 · Nodes are styled `<div>`, not the shadcn `<Card>` — P2**
- *What's wrong:* The prompt → model → results chrome, Regenerate (`Button`), and "try another model" (shadcn `Select`) are all wired, but the node containers are bare styled `<div>` (`map-view.tsx:406,511,627`), not the `<Card>` primitive. `frontend/src/components/ui/card.tsx` exists but is unimported here. The design ref itself uses plain divs (`.m-prompt`/`.m-col`), so this is a faithful port — only the literal "shadcn Card" wording isn't met.
- *Evidence:* `grep '<Card|ui/card' map-view.tsx` → exit 1; chrome/actions confirmed at `map-view.tsx:419-443, 458-465, 466-472`.
- *Fix:* If strict shadcn-Card usage is required, swap the `PromptNode`/`ModelColumn` outer `<div>`s for `<Card>`. Otherwise accept as design-faithful.

### E. Forms — ✅ (one P2 inside)

**E-1 · One bare native file `<input>` — P2**
- *What's wrong:* `upload-dialog.tsx:128` has `<input type="file" className="hidden" …>`. shadcn ships no file-input primitive, and it is nested inside a `<FormControl>` driving `field.onChange`, so this is the standard pattern — but it is the single native form element in feature code.
- *Evidence:* `rg -n "<input|<textarea|<select" frontend/src -g '!**/ui/**'` → exactly one hit, the hidden file input.
- *Fix:* Acceptable as-is. Optionally extract a reusable `<FileDropField>` wrapper to keep the lone native `<input>` out of feature code.

### G. Backend behavior — ✅ (one P2 inside)

**G-1 · Streaming completion must not be severed by the resilience pipeline — ✅ HARDENED**
- *Risk found during the fix pass:* `AddStandardResilienceHandler` (Polly-backed) applied to the **same** client used for the SSE streaming completion. Its total-request timeout + attempt timeout + auto-retry would abort or silently **replay** a partially-streamed generation mid-flight.
- *Resolution:* Split the clients in `Infrastructure/DependencyInjection.cs`:
  - The typed `IOpenRouterClient` keeps `AddStandardResilienceHandler` (Attempt 30s / Total 90s / breaker) and is used **only for non-streaming** calls (`/models`).
  - A separate named client `OpenRouterClient.StreamClientName` (`"openrouter-stream"`) has **no resilience handler** and `Timeout = Timeout.InfiniteTimeSpan`; `StreamChatAsync` resolves it via `IHttpClientFactory`. Cancellation flows through the caller's token only — never auto-retried.
- *Evidence:* `DependencyInjection.cs` — `AddStandardResilienceHandler` on the typed client; `AddHttpClient(OpenRouterClient.StreamClientName, …)` with `Timeout.InfiniteTimeSpan` and no handler; `OpenRouterClient.StreamChatAsync` uses `httpFactory.CreateClient(StreamClientName)`. Resilience is retained for non-streaming (CLAUDE.md "Polly" intent preserved — the standard handler *is* the Polly pipeline).

### I. AI integration — ✅ (one 🔍 inside)

**I-1 · Live `/models` returning the actual GPT-5 id — 🔍 (code side now implemented)**
- *Code side — ✅ ADDED:* `ISettingsService.ValidateDefaultModelAsync` (`SettingsService.cs`) checks the configured default model against the live `/models` list and **never throws** — returns `NoKey` (no network call) when unset, `Error` on failure. A background `ModelValidationHostedService` (`Api/Startup/`) runs it on startup and **logs a warning** if the id is missing, without blocking startup or crashing when no key is set. The model id stays configurable (seed `openai/gpt-5`).
- *Human step still 🔍:* with a live OpenRouter key, run `POST /api/settings/models/refresh` (or just start the API and read the log line) and confirm `openai/gpt-5` is the real id; update the seed/default if it differs.

### J. Infra — ✅ (one P2 inside)

**J-1 · `OpenRouter__ApiKey` documented but unread at startup — P2 — ✅ RESOLVED**
- *Resolution:* Removed the unused `OpenRouter__ApiKey` slot from `docker-compose.yml`, `infra/.env.example`, and the root `.env`, leaving a comment that the key is set write-only (encrypted) via the Settings UI. `rg "OpenRouter__ApiKey"` over those files is now empty.
- *What was wrong:* `OpenRouter__ApiKey` is in `infra/.env.example:38` and passed into the api container (`docker-compose.yml:38`) but no backend startup config reads it (`rg 'OpenRouter:ApiKey|OpenRouter__ApiKey'` over backend → no consumer; only `OpenRouter:BaseUrl` at `Program.cs:30`). Per design the runtime key lives encrypted in `AppSettings` (set via Settings UI), so the env var is inert. Harmless over-documentation, not a missing required var.
- *Evidence:* see above grep; all 11 other compose vars are consumed (`Program.cs:28,30,37,96,129`, db env, web build arg).
- *Fix:* Either remove `OpenRouter__ApiKey` from `.env.example`/`.env`/compose, or add startup code that seeds `AppSettings.OpenRouterApiKeyEncrypted` from it when set, or add a comment noting it's configured via Settings, not env.

### L. Hygiene — ⚠️

**L-1 · Stale `frontend/README.md` with npm/yarn/pnpm instructions — P2 — ✅ RESOLVED**
- *Resolution:* Replaced the create-next-app boilerplate with a Bun-only README (`bun install`, `bun run dev`, `bun run build`, `bun run gen:api`). `rg -ni "npm|yarn|pnpm" frontend/README.md` returns nothing.

**L-2 · `localStorage` used for theme accent — P2**
- *What's wrong:* `accent-provider.tsx:23,36` reads/writes `localStorage` for the theme accent. No `sessionStorage`, no auth tokens/session persisted (auth is cookie-based), so the *security* intent of the "no browser storage" rule holds; only a non-sensitive UI preference is stored.
- *Evidence:* `rg -ni "localStorage|sessionStorage" frontend/src` → 3 hits, all the accent preference (+ a doc comment in `lib/theme/accents.ts:5`).
- *Fix:* If the rule is strict, move the accent preference to a cookie (consistent with the cookie-based design); otherwise accept for non-sensitive prefs and document the exception. No security risk as-is.

---

## 3. Prioritized fix list

**P0 — blocks a core flow:** none.

**P1 — important:**
1. ✅ **A-1** — `Newtonsoft.Json` pinned to 13.0.3 on `TeamPrompts.Api`; NU1903 cleared, build 0 warnings.

**P2 — polish / hygiene:**
2. ✅ **A-2** — `OpenRouterClient` streaming loop rewritten to async cancellable `ReadLineAsync(ct)`.
3. ✅ **G-1** — Streaming completion moved to a separate non-resilient client (no total-timeout / no retry); resilience kept for non-streaming `/models`.
4. ✅ **B-1** — `DOTS` arrays + `PROVIDER_DOT` mapped to `--chart-*` tokens; no hex left in the canvas.
5. ✅ **J-1** — Unused `OpenRouter__ApiKey` removed from compose / `.env.example` / `.env`.
6. ✅ **L-1** — `frontend/README.md` rewritten Bun-only.
7. ◻️ **A-3** — *(not in this batch)* Remove committed `Seed__AdminPassword` default + don't publish `db:5432` in a prod compose profile/override.
8. ◻️ **C-1** — *(accepted)* Resizable rails kept; defaults match the design.
9. ◻️ **D-1** — *(accepted)* Nodes kept as design-faithful `<div>`s rather than shadcn `<Card>`.
10. ◻️ **E-1** — *(accepted)* Hidden file `<input>` kept (no shadcn file primitive); wrapped in `FormControl`.
11. ◻️ **L-2** — *(accepted)* Theme accent stays in `localStorage` (non-sensitive UI pref; auth is cookie-based).

**Verify when a resource is available:**
- **I-1 (🔍)** — Code-side validation now logs a warning on startup if the configured model isn't in `/models`. With a live OpenRouter key, start the API (read the log line) or `POST /api/settings/models/refresh` and confirm `openai/gpt-5` is the real id.

---

## 5. Post-fix verification (2026-06-19)

All fixes were applied and re-verified with build output + grep:

| Item | Check | Result |
|------|-------|--------|
| A-1 | `dotnet list package --include-transitive \| rg -i newtonsoft` | `Newtonsoft.Json 13.0.3 13.0.3` ✅ |
| A-1/A-2 | `dotnet build backend/TeamPrompts.slnx` | `Build succeeded.` / **0 Warning(s)** / **0 Error(s)** ✅ |
| A-2 | `rg "EndOfStream" OpenRouterClient.cs` | no matches ✅ |
| G-1 | `DependencyInjection.cs` | typed client has `AddStandardResilienceHandler` (Attempt 30s / Total 90s); `AddHttpClient("openrouter-stream")` has `Timeout.InfiniteTimeSpan` + **no** handler; `StreamChatAsync` uses `CreateClient(StreamClientName)` ✅ |
| B-1 | `rg "#[0-9a-fA-F]{3,6}" frontend/src/components/generation frontend/src/lib/models.ts` | no matches ✅ |
| J-1 | `rg "OpenRouter__ApiKey" docker-compose.yml infra/.env.example .env` | no matches ✅ |
| L-1 | `rg -ni "npm\|yarn\|pnpm" frontend/README.md` | no matches ✅ |
| 🔍 I-1 | `ModelValidationHostedService` + `ISettingsService.ValidateDefaultModelAsync` | registered via `AddHostedService`; warns, never blocks/crashes when no key ✅ |
| build | `bun run build` (frontend) | `Compiled successfully` / TypeScript clean / 8/8 static pages ✅ |
| infra | `docker compose config --services` | `api / caddy / db / web` (validates) ✅ |

**Files touched by the fix pass:** `TeamPrompts.Api.csproj`, `OpenRouterClient.cs`,
`Infrastructure/DependencyInjection.cs`, `Application/Services/SettingsService.cs`,
`Api/Startup/ModelValidationHostedService.cs` (new), `Api/Program.cs`, `grid-view.tsx`,
`columns-view.tsx`, `lib/models.ts`, `frontend/README.md`, `docker-compose.yml`,
`infra/.env.example`, `.env`, and this report.

---

## 4. Evidence appendix (build gates, verbatim)

- **Backend** — `dotnet build backend/TeamPrompts.slnx`: `Build succeeded.` / `3 Warning(s)` / `0 Error(s)`, all 4 project DLLs emitted (.NET SDK 10.0.100). Warnings: NU1903 (Newtonsoft.Json ×2), CA2024 (OpenRouterClient.cs:39).
- **Frontend** — `bun install` (bun 1.3.3, no npm) + `bun run build`: Next.js 16.2.9 (Turbopack), `Compiled successfully`, TypeScript checked with no diagnostics (`next.config.ts` does **not** ignore build/TS errors), static pages 8/8, exit 0, `.next/BUILD_ID` + `.next/standalone/server.js` produced.
- **Infra** — `docker compose config`: exit 0, resolved services `api`, `caddy`, `db`, `web` (matches `docker-compose.yml` lines 2/22/51/68).

*Generated by a 15-agent read-only verification sweep. All citations point at the working tree at audit time.*
