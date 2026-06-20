"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Columns3, LayoutGrid, Loader2, Network, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePostApiGeneration } from "@/api/endpoints/generation/generation";
import { useGetApiScriptsIdSessions } from "@/api/endpoints/scripts/scripts";
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
  } = useWorkspace();
  const { subscribeScript } = useGenerationStream();
  const gen = usePostApiGeneration();
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

  return (
    <section className="flex h-full min-w-0 flex-col bg-muted">
      {/* center-head */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-border bg-background px-5 py-3">
        <div className="flex min-w-0 flex-1 justify-center">
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
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
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
          <MapView groups={groups} scriptId={activeScriptId} />
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
  // Stable layout: positions are fixed by FIRST appearance (oldest-first), so re-generating a
  // model just refreshes its card in place instead of shuffling prompts/models around. The API
  // returns sessions newest-first, so we iterate oldest-first and let a newer run overwrite its
  // existing (prompt, model) slot — same position, newest content.
  const ordered = [...sessions].sort(
    (a, b) => +new Date(a.session.createdAt) - +new Date(b.session.createdAt),
  );
  const groups: Group[] = [];
  const groupIndex = new Map<string, number>();
  const modelSlot = new Map<string, number>(); // `${promptId}|${model}` -> index in group.sessions
  for (const s of ordered) {
    const pid = s.session.promptId;
    if (!groupIndex.has(pid)) {
      groupIndex.set(pid, groups.length);
      groups.push({ promptId: pid, promptName: s.session.promptName, sessions: [] });
    }
    const g = groups[groupIndex.get(pid)!];
    const key = `${pid}|${s.session.model}`;
    const slot = modelSlot.get(key);
    if (slot === undefined) {
      modelSlot.set(key, g.sessions.length);
      g.sessions.push(s);
    } else {
      g.sessions[slot] = s; // newer run for an existing model — keep its position
    }
  }
  return groups;
}
