"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Columns3, Heart, LayoutGrid, Loader2, Network, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePostApiGeneration } from "@/api/endpoints/generation/generation";
import {
  getGetApiScriptsQueryKey,
  useDeleteApiScriptsIdSessions,
  useGetApiScriptsIdSessions,
} from "@/api/endpoints/scripts/scripts";
import type { SessionWithResultsDto } from "@/api/model";
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
    activeScriptId,
    selectedPromptIds,
    batchScriptIds,
    runModels,
    view,
    setView,
    showHighlightsOnly,
    setShowHighlightsOnly,
  } = useWorkspace();
  const { subscribeScript } = useGenerationStream();
  const gen = usePostApiGeneration();
  const clearCanvas = useDeleteApiScriptsIdSessions();
  const [generating, setGenerating] = useState(false);

  const { data: sessions, isLoading } = useGetApiScriptsIdSessions(activeScriptId ?? "", {
    query: { enabled: !!activeScriptId },
  });

  useEffect(() => {
    if (activeScriptId) subscribeScript(activeScriptId);
  }, [activeScriptId, subscribeScript]);

  const scriptIds = batchScriptIds.length > 0 ? batchScriptIds : activeScriptId ? [activeScriptId] : [];
  const missing = [
    scriptIds.length === 0 && "a script",
    selectedPromptIds.length === 0 && "a prompt",
    runModels.length === 0 && "a model",
  ].filter(Boolean) as string[];
  const canGenerate = missing.length === 0 && !generating;

  const groups = groupByPrompt(sessions ?? []);
  const hasResults = groups.length > 0;

  const onGenerate = async () => {
    if (!canGenerate) return;
    const models = runModels.length > 0 ? runModels : [null];
    setGenerating(true);
    // Fan out one request per model; settle them all so a single failure
    // never blocks invalidation/feedback for the runs that started.
    const settled = await Promise.allSettled(
      models.map((model) =>
        gen.mutateAsync({ data: { scriptIds, promptIds: selectedPromptIds, model, variantCount: null } }),
      ),
    );
    setGenerating(false);
    if (activeScriptId) invalidatePath(qc, `/api/scripts/${activeScriptId}/sessions`);
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
        {/* left: highlights filter + clear the whole canvas */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {hasResults && (
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
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
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
        ) : !hasResults ? (
          <CenterEmpty
            title="No results yet"
            body="Pick a script on the left and one or more prompts on the right, choose which AI models to run, then hit Generate. Every prompt runs against each model you pick — compare them side by side and keep the winners."
          />
        ) : view === "columns" ? (
          <ColumnsView groups={groups} scriptId={activeScriptId} />
        ) : view === "grid" ? (
          <GridView groups={groups} scriptId={activeScriptId} />
        ) : (
          <MapView key={activeScriptId} groups={groups} scriptId={activeScriptId} />
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

function groupByPrompt(sessions: SessionWithResultsDto[]): Group[] {
  // Keep EVERY run — the map groups them by model into one block so each "Generate more" shows as a
  // separate, labelled generation. Order is stable: prompts and models by first appearance, runs
  // chronological, so positions never shuffle when a new run lands.
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
      groups.push({ promptId: pid, promptName: s.session.promptName, sessions: [] });
      modelBuckets.set(pid, new Map());
    }
    const models = modelBuckets.get(pid)!;
    if (!models.has(s.session.model)) models.set(s.session.model, []);
    models.get(s.session.model)!.push(s);
  }
  for (const [pid, idx] of groupIndex) {
    groups[idx].sessions = [...modelBuckets.get(pid)!.values()].flat();
  }
  return groups;
}
