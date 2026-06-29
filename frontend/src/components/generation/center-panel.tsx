"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Columns3, Heart, LayoutGrid, Loader2, Network, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePostApiGeneration } from "@/api/endpoints/generation/generation";
import { useGetApiPrompts } from "@/api/endpoints/prompts/prompts";
import { useGetApiScriptProjectsId } from "@/api/endpoints/script-projects/script-projects";
import {
  getGetApiScriptsIdQueryKey,
  getGetApiScriptsQueryKey,
  useDeleteApiScriptsIdSessions,
  useGetApiScriptsId,
  useGetApiScriptsIdSessions,
} from "@/api/endpoints/scripts/scripts";
import { PromptKind, type ScriptDto, SessionStatus, type SessionWithResultsDto } from "@/api/model";
import { ColumnsView } from "@/components/generation/columns-view";
import { GridView } from "@/components/generation/grid-view";
import { MapView, type Group } from "@/components/generation/map-view";
import { ModelPicker } from "@/components/generation/model-picker";
import { SelectionTray } from "@/components/tray/selection-tray";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { invalidatePath } from "@/lib/query/invalidate";
import { useGenerationStream } from "@/lib/realtime/generation-stream";
import { cn } from "@/lib/utils";
import { type CenterView, useWorkspace } from "@/lib/workspace/workspace-context";

const VIEWS: { k: CenterView; label: string; Icon: typeof Columns3 }[] = [
  { k: "columns", label: "Columns", Icon: Columns3 },
  { k: "grid", label: "Grid", Icon: LayoutGrid },
  { k: "map", label: "Map", Icon: Network },
];

export function CenterPanel() {
  const qc = useQueryClient();
  const {
    activeWorkspaceId,
    activeScriptId,
    selectedPromptIds,
    promptVersions,
    batchScriptIds,
    runModels,
    rememberRunSetup,
    view,
    setView,
    showHighlightsOnly,
    setShowHighlightsOnly,
    focusSummaryOnly,
    setFocusSummaryOnly,
  } = useWorkspace();
  const { subscribeScript } = useGenerationStream();
  const gen = usePostApiGeneration();
  const clearCanvas = useDeleteApiScriptsIdSessions();
  const [generating, setGenerating] = useState(false);

  const { data: sessions, isLoading } = useGetApiScriptsIdSessions(activeScriptId ?? "", {
    query: { enabled: !!activeScriptId },
  });

  // Resolve the active script's project so we can surface its Summary (the mind-map anchor). Poll while
  // the Summary is still generating — the variant pipeline doesn't stream over SignalR, so refetch to
  // reflect completion. (Two cheap dependent reads; only the active script, only when it has a project.)
  const { data: activeScript } = useGetApiScriptsId(activeScriptId ?? "", {
    query: { enabled: !!activeScriptId },
  });
  const projectId = (activeScript as ScriptDto | undefined)?.projectId ?? null;
  const { data: project } = useGetApiScriptProjectsId(projectId ?? "", {
    query: {
      enabled: !!projectId,
      refetchInterval: (q) => {
        const s = (q.state.data as { summary?: ScriptDto | null } | undefined)?.summary;
        return s && (s.variantStatus === SessionStatus.Queued || s.variantStatus === SessionStatus.Streaming)
          ? 2500
          : false;
      },
    },
  });
  const summary = ((project as { summary?: ScriptDto | null } | undefined)?.summary ?? null) as ScriptDto | null;

  // The team-wide prompt order (right Prompt Library) drives the top-to-bottom lane order of the map.
  // The list comes back already sorted by SortOrder, so its array index IS the rank.
  const { data: promptList } = useGetApiPrompts(
    { workspaceId: activeWorkspaceId },
    { query: { enabled: !!activeWorkspaceId } },
  );
  const promptOrder = useMemo(() => {
    const m = new Map<string, number>();
    (promptList ?? []).forEach((p, i) => m.set(p.id, i));
    return m;
  }, [promptList]);

  // Every Summary-related prompt — a Summary KIND prompt OR one carrying the Summary tag — gets chained
  // to the Summary node on the canvas (placed in its branch). The session marker (isSummarySource) covers
  // tagged prompts that ran against the Summary script; this also catches Summary-kind prompts.
  const summaryPromptIds = useMemo(
    () =>
      new Set(
        (promptList ?? [])
          .filter((p) => p.kind === PromptKind.Summary || p.useSummarySource)
          .map((p) => p.id),
      ),
    [promptList],
  );

  useEffect(() => {
    if (activeScriptId) subscribeScript(activeScriptId);
  }, [activeScriptId, subscribeScript]);

  // Generation targets ONLY checkbox-selected scripts — never the merely-viewed active script.
  // Switching scripts to browse must not arm Generate.
  const scriptIds = batchScriptIds;
  const missing = [
    scriptIds.length === 0 && "a script (check one on the left)",
    selectedPromptIds.length === 0 && "a prompt",
    runModels.length === 0 && "a model",
  ].filter(Boolean) as string[];
  const canGenerate = missing.length === 0 && !generating;

  const allGroups = useMemo(
    () => groupByPrompt(sessions ?? [], promptOrder, summaryPromptIds),
    [sessions, promptOrder, summaryPromptIds],
  );
  // Left-side "Focus" narrows the center to just the Summary branch (summary-tagged lanes). Only takes
  // effect when the active script actually has a Summary — otherwise there'd be no way to un-focus.
  const groups = useMemo(
    () => (focusSummaryOnly && summary ? allGroups.filter((g) => g.segment === "summary") : allGroups),
    [allGroups, focusSummaryOnly, summary],
  );
  const hasResults = groups.length > 0;

  const onGenerate = async () => {
    if (!canGenerate) return;
    // Remember this prompt+model selection so a newly added script can inherit it (#12).
    rememberRunSetup();
    const models = runModels.length > 0 ? runModels : [null];
    // Resolve each prompt's version now: a pinned version, else null = the prompt's current main.
    const prompts = selectedPromptIds.map((promptId) => ({
      promptId,
      promptVersionId: promptVersions[promptId]?.versionId ?? null,
    }));
    setGenerating(true);
    // Fan out one request per model; settle them all so a single failure
    // never blocks invalidation/feedback for the runs that started.
    const settled = await Promise.allSettled(
      models.map((model) => gen.mutateAsync({ data: { scriptIds, prompts, model, variantCount: null } })),
    );
    setGenerating(false);
    // Refetch sessions (the new nodes) AND the project — the master Summary may have just been created,
    // and its node only shows once the project query picks it up (otherwise it appears only after a reload).
    if (activeScriptId) {
      invalidatePath(qc, `/api/scripts/${activeScriptId}/sessions`, "/api/script-projects");
      // The script may have just been wrapped in a project (orphan → project) — refetch it (exact key, so
      // the shared canvas-layout query isn't swept) so its new projectId surfaces the Summary node.
      qc.invalidateQueries({ queryKey: getGetApiScriptsIdQueryKey(activeScriptId) });
    }
    const ok = settled.filter((r) => r.status === "fulfilled").length;
    if (ok === 0) toast.error("Could not start generation");
    else if (ok < settled.length) toast.warning(`Started ${ok} of ${settled.length} runs`);
    else toast.success(settled.length > 1 ? `Started ${ok} runs` : "Generation started");
  };

  // Wipe every run on the canvas for the active script. Destructive — confirm first.
  const onClearCanvas = () => {
    if (!activeScriptId || clearCanvas.isPending) return;
    if (!confirm("Clear the whole canvas? This deletes every generated run for this script and can’t be undone."))
      return;
    clearCanvas.mutate(
      { id: activeScriptId },
      {
        onSuccess: () => {
          invalidatePath(qc, `/api/scripts/${activeScriptId}/sessions`, `/api/scripts/${activeScriptId}/tray`);
          // Refresh just the scripts list (SessionCount) — not the bare "/api/scripts" prefix, which
          // would also sweep the shared canvas-layout query and force a needless refetch.
          qc.invalidateQueries({ queryKey: getGetApiScriptsQueryKey() });
          toast.success("Canvas cleared");
        },
        onError: () => toast.error("Couldn’t clear the canvas"),
      },
    );
  };

  return (
    <section className="flex h-full min-w-0 flex-col bg-muted">
      {/* center-head */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-border bg-background px-5 py-3">
        {/* left: highlights filter + clear the whole canvas. On the Map the highlights toggle lives in
            the canvas controls menu instead, so it isn't duplicated here. */}
        <div className="flex flex-1 basis-0 items-center gap-2">
          {summary && (
            <button
              onClick={() => setFocusSummaryOnly(!focusSummaryOnly)}
              title={
                focusSummaryOnly
                  ? "Showing only the Summary branch — click to show everything"
                  : "Focus on the Summary branch (the mind-map node + its prompts)"
              }
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors",
                focusSummaryOnly
                  ? "border-violet-400/70 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                  : "border-border text-muted-foreground hover:border-violet-400/50 hover:text-violet-600",
              )}
            >
              <Network className="size-3.5" />
              Summary
            </button>
          )}
          {hasResults && view !== "map" && (
            <button
              onClick={() => setShowHighlightsOnly(!showHighlightsOnly)}
              title={
                showHighlightsOnly
                  ? "Showing only highlights — click to show every result"
                  : "Spotlight the team’s highlights and dim the rest"
              }
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors",
                showHighlightsOnly
                  ? "border-rose-400/60 bg-rose-500/10 text-rose-600"
                  : "border-border text-muted-foreground hover:border-rose-400/50 hover:text-rose-600",
              )}
            >
              <Heart className={cn("size-3.5", showHighlightsOnly && "fill-current")} />
              Highlights
            </button>
          )}
          {hasResults && (
            <button
              onClick={onClearCanvas}
              disabled={clearCanvas.isPending}
              title="Clear every run on this script’s canvas"
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {clearCanvas.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Clear canvas
            </button>
          )}
        </div>
        {/* center: view toggle */}
        <div className="flex shrink-0 justify-center">
          <div className="flex gap-0.5 rounded-lg border border-border bg-muted p-[3px]">
            {VIEWS.map((v) => (
              <button
                key={v.k}
                onClick={() => setView(v.k)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  view === v.k
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <v.Icon className="size-3.5" />
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-1 basis-0 items-center justify-end gap-2.5">
          <ModelPicker />
          <Button
            onClick={onGenerate}
            disabled={!canGenerate}
            title={missing.length ? `Pick ${missing.join(", ")} first` : undefined}
            className="h-9 min-w-[132px] justify-center gap-1.5 rounded-md text-[13.5px]"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate
              </>
            )}
          </Button>
        </div>
      </div>

      {/* results */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!activeScriptId ? (
          <CenterEmpty
            title="Pick a script"
            body="Select a script on the left to see everything generated for it."
          />
        ) : isLoading ? (
          <div className="flex flex-col gap-4 p-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : view === "map" ? (
          // The Map shows the Summary as a node even before any lane has results.
          hasResults || summary ? (
            <MapView
              key={activeScriptId}
              groups={groups}
              scriptId={activeScriptId}
              summary={summary}
              projectId={projectId}
            />
          ) : (
            <CenterEmpty
              title="No results yet"
              body="Pick a script on the left and one or more prompts on the right, choose which AI models to run, then hit Generate."
            />
          )
        ) : !hasResults ? (
          <CenterEmpty
            title="No results yet"
            body="Pick a script on the left and one or more prompts on the right, choose which AI models to run, then hit Generate. Every prompt runs against each model you pick — compare them side by side and keep the winners."
          />
        ) : view === "columns" ? (
          <ColumnsView groups={groups} scriptId={activeScriptId} />
        ) : (
          <GridView groups={groups} scriptId={activeScriptId} />
        )}
      </div>

      <SelectionTray />
    </section>
  );
}

function CenterEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 p-10 text-center">
      <div className="flex size-[46px] items-center justify-center rounded-xl border border-border-strong text-muted-foreground">
        <Sparkles className="size-5" />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function groupByPrompt(
  sessions: SessionWithResultsDto[],
  /** promptId → rank from the Prompt Library order (lower = higher up). Drives the lane order. */
  promptOrder: Map<string, number>,
  /** prompts related to the Summary (Summary kind OR summary-tagged) — chained to the Summary node. */
  summaryPromptIds: Set<string>,
): Group[] {
  // Keep EVERY run — the map groups them by model into one block so each "Generate more" shows as a
  // separate, labelled generation. Within a prompt: models by first appearance, runs chronological,
  // so a new run never shuffles a block. Across prompts: follow the team's Prompt Library order.
  const ordered = [...sessions].sort(
    (a, b) => +new Date(a.session.createdAt) - +new Date(b.session.createdAt),
  );
  const groups: Group[] = [];
  const groupIndex = new Map<string, number>();
  const modelBuckets = new Map<string, Map<string, SessionWithResultsDto[]>>(); // pid -> model -> runs
  for (const s of ordered) {
    const pid = s.session.promptId;
    if (!groupIndex.has(pid)) {
      groupIndex.set(pid, groups.length);
      groups.push({
        promptId: pid,
        promptName: s.session.promptName,
        sessions: [],
        // Summary-related lanes (ran against the Summary script, OR a Summary-kind / summary-tagged
        // prompt) live in the Summary branch and chain to the Summary node.
        segment: s.session.isSummarySource || summaryPromptIds.has(pid) ? "summary" : "main",
      });
      modelBuckets.set(pid, new Map());
    }
    if (s.session.isSummarySource || summaryPromptIds.has(pid)) groups[groupIndex.get(pid)!].segment = "summary";
    const models = modelBuckets.get(pid)!;
    if (!models.has(s.session.model)) models.set(s.session.model, []);
    models.get(s.session.model)!.push(s);
  }
  for (const [pid, idx] of groupIndex) {
    groups[idx].sessions = [...modelBuckets.get(pid)!.values()].flat();
  }
  // Order lanes: the Summary branch first (always-first), then by the Prompt Library rank. Prompts with
  // no rank (e.g. deleted but past runs remain) sink to the bottom, keeping their stable first-appearance
  // order. Array#sort is stable, so the first-appearance index is the natural tiebreak.
  const segRank = (g: Group) => (g.segment === "summary" ? 0 : 1);
  const rankOf = (g: Group) => promptOrder.get(g.promptId) ?? Number.MAX_SAFE_INTEGER;
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => segRank(a.g) - segRank(b.g) || rankOf(a.g) - rankOf(b.g) || a.i - b.i)
    .map((x) => x.g);
}
