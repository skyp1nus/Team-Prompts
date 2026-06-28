"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, Network, PanelRightClose, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getGetApiPromptsQueryKey,
  useDeleteApiPromptsId,
  useGetApiPrompts,
  usePutApiPromptsReorder,
} from "@/api/endpoints/prompts/prompts";
import { PromptKind, type PromptListItemDto } from "@/api/model";
import { CreatePromptDialog } from "@/components/prompts/create-prompt-dialog";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { invalidatePath } from "@/lib/query/invalidate";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export function PromptsPanel() {
  const qc = useQueryClient();
  const {
    activeWorkspaceId,
    selectedPromptIds,
    togglePrompt,
    prunePrompts,
    promptVersions,
    setPromptsPanelCollapsed,
  } = useWorkspace();
  const { data: prompts, isLoading } = useGetApiPrompts(
    { workspaceId: activeWorkspaceId },
    { query: { enabled: !!activeWorkspaceId } },
  );
  const del = useDeleteApiPromptsId();
  const reorder = usePutApiPromptsReorder();
  const [openPromptId, setOpenPromptId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<PromptKind | null>(null);

  // The master Summary is auto-resolved + stable (no manual flag): the workspace's OLDEST Summary-kind
  // prompt — the same rule the backend uses. Pinned to the top of the library with a frame; one per
  // workspace; not selectable for a run (it auto-runs as the mind map).
  const masterSummary = useMemo(() => {
    const summaries = (prompts ?? []).filter((p) => p.kind === PromptKind.Summary);
    if (summaries.length === 0) return null;
    return [...summaries].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.id.localeCompare(b.id))[0];
  }, [prompts]);
  const masterSummaryId = masterSummary?.id ?? null;

  // Self-heal a persisted selection: drop any prompt id that no longer exists.
  useEffect(() => {
    if (prompts) prunePrompts(prompts.map((p) => p.id));
  }, [prompts, prunePrompts]);

  // Client-side filter for display only — onDragEnd still indexes into the full `prompts` list, so
  // dragging within a filtered view persists a correct whole-workspace order.
  const visible = kindFilter ? (prompts ?? []).filter((p) => p.kind === kindFilter) : prompts;
  // The master Summary is rendered as a pinned, framed card on top — keep it out of the sortable list.
  const sortable = (visible ?? []).filter((p) => p.id !== masterSummaryId);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Drag a prompt to set the team-wide top-to-bottom order. The list itself is the source of truth
  // (already sorted by SortOrder), so we reorder the cached list optimistically, then persist the new
  // id sequence. On failure we refetch to snap back. This same order drives the center map's lanes.
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !prompts || !activeWorkspaceId) return;
    const from = prompts.findIndex((p) => p.id === active.id);
    const to = prompts.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(prompts, from, to);
    const key = getGetApiPromptsQueryKey({ workspaceId: activeWorkspaceId });
    qc.setQueryData(key, next); // optimistic
    reorder.mutate(
      { data: { workspaceId: activeWorkspaceId, orderedIds: next.map((p) => p.id) } },
      {
        onError: () => {
          invalidatePath(qc, "/api/prompts"); // revert to the server order
          toast.error("Couldn’t save the order");
        },
      },
    );
  };

  const onDelete = (id: string, name: string) => {
    if (!confirm(`Delete prompt "${name}"?`)) return;
    del.mutate(
      { id },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/prompts");
          toast.success("Prompt deleted");
        },
        onError: () => toast.error("Delete failed (it may be in use by past generations)"),
      },
    );
  };

  const n = selectedPromptIds.length;

  return (
    <aside className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
        <h2 className="eyebrow">Prompt Library</h2>
        <div className="flex items-center gap-1.5">
          <CreatePromptDialog />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPromptsPanelCollapsed(true)}
                  aria-label="Collapse prompts panel"
                >
                  <PanelRightClose />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              Collapse
              <kbd
                data-slot="kbd"
                className="rounded border border-background/25 px-1 font-mono text-[10px] leading-4"
              >
                ⌘⌥B
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="px-3.5 pb-2 text-[11px] text-faint">
        {n === 0 ? "No prompts selected" : `${n} prompt${n === 1 ? "" : "s"} selected`}
      </div>
      <div className="px-3.5 pb-2.5">
        <ToggleGroup
          value={[kindFilter ?? "all"]}
          onValueChange={(v) => {
            const next = (v as string[])[v.length - 1];
            if (!next) return;
            setKindFilter(next === "all" ? null : (next as PromptKind));
          }}
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
        >
          <ToggleGroupItem value="all" className="flex-1">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value={PromptKind.MainScripts} className="flex-1">
            Main Scripts
          </ToggleGroupItem>
          <ToggleGroupItem value={PromptKind.Summary} className="flex-1">
            Summary
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2.5 pb-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-1 h-[54px] w-full" />)}

          {/* the workspace's single master Summary — pinned + framed (only when not filtered out) */}
          {!isLoading && masterSummary && (!kindFilter || kindFilter === PromptKind.Summary) && (
            <MasterSummaryRow
              prompt={masterSummary}
              onOpen={() => setOpenPromptId(masterSummary.id)}
              onDelete={() => onDelete(masterSummary.id, masterSummary.name)}
            />
          )}

          {!isLoading && (visible?.length ?? 0) === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-faint">
              {kindFilter ? "No prompts of this type." : "No prompts yet."}
              <br />
              {kindFilter ? "Switch the filter or create one." : "Create one to begin."}
            </p>
          )}
          {sortable.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sortable.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {sortable.map((p) => (
                  <PromptRow
                    key={p.id}
                    prompt={p}
                    selected={selectedPromptIds.includes(p.id)}
                    pinnedVersion={promptVersions[p.id]?.number ?? null}
                    onToggle={() => togglePrompt(p.id)}
                    onOpen={() => setOpenPromptId(p.id)}
                    onDelete={() => onDelete(p.id, p.name)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </ScrollArea>

      <PromptDetailDialog
        promptId={openPromptId}
        open={openPromptId !== null}
        onOpenChange={(o) => !o && setOpenPromptId(null)}
      />
    </aside>
  );
}

/** The workspace's single master Summary prompt — pinned at the top of the library with a frame so it
 *  reads as THE mind-map source. Auto-resolved (oldest Summary); not selectable for a run (it auto-runs
 *  as the mind map); not draggable. */
function MasterSummaryRow({
  prompt,
  onOpen,
  onDelete,
}: {
  prompt: PromptListItemDto;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      title="The mind-map source — auto-runs on each script's first generation"
      className="group relative mb-2 flex cursor-pointer items-start gap-2 rounded-lg border-[1.5px] border-violet-400/70 bg-violet-500/[0.05] p-2.5 transition-colors hover:bg-violet-500/[0.09]"
    >
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400">
        <Network className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-[13px] font-semibold">{prompt.name}</span>
        <div className="mt-[3px] flex items-center gap-1.5 text-[11px] text-faint">
          <span className="shrink-0 rounded-[5px] bg-violet-500/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-violet-600 dark:text-violet-400">
            MIND MAP · MASTER
          </span>
          <span className="truncate">
            auto-runs · {prompt.versionCount} version{prompt.versionCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-card hover:text-foreground hover:shadow-sm"
        title="History & versions"
      >
        <SlidersHorizontal className="size-3.5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-colors group-hover:opacity-100 hover:bg-card hover:text-foreground"
        title="Delete prompt"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function PromptRow({
  prompt,
  selected,
  pinnedVersion,
  onToggle,
  onOpen,
  onDelete,
}: {
  prompt: PromptListItemDto;
  selected: boolean;
  /** "vN" pinned for the next run, or null to follow Main. */
  pinnedVersion: number | null;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const hasMain = !!prompt.mainVersionId;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prompt.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onToggle}
      className={cn(
        "group relative mb-[3px] flex cursor-pointer items-start gap-1.5 rounded-lg p-2.5 transition-colors hover:bg-accent",
        selected && "bg-primary/[0.07]",
        isDragging && "z-10 opacity-60",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-faint opacity-0 transition-colors group-hover:opacity-100 hover:text-foreground"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical className="size-3.5" />
      </button>
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] text-[11px] transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
        )}
      >
        {selected && "✓"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{prompt.name}</span>
          {pinnedVersion !== null ? (
            <span
              title="The next run will use this pinned version"
              className="shrink-0 rounded-[5px] bg-warn/15 px-1.5 py-px text-[9.5px] font-bold tracking-wide text-warn"
            >
              v{pinnedVersion}
            </span>
          ) : (
            hasMain && (
              <span className="shrink-0 rounded-[5px] bg-primary/[0.08] px-1.5 py-px text-[9.5px] font-bold tracking-wide text-primary">
                MAIN
              </span>
            )
          )}
        </div>
        <div className="mt-[3px] flex items-center gap-1.5 text-[11px] text-faint">
          {prompt.kind === PromptKind.Summary ? (
            <span
              title="Transforms a script into a new Summary script"
              className="shrink-0 rounded-[5px] bg-ok/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-ok"
            >
              SUMMARY
            </span>
          ) : (
            <span
              title="Generates the main content"
              className="shrink-0 rounded-[5px] bg-accent px-1.5 py-px text-[9px] font-bold tracking-wide text-muted-foreground"
            >
              MAIN
            </span>
          )}
          {prompt.useSummarySource && (
            <span
              title="Runs against the project's Summary script (Summary branch)"
              className="shrink-0 rounded-[5px] bg-violet-500/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-violet-600 dark:text-violet-400"
            >
              ↳ SUMMARY
            </span>
          )}
          {prompt.useKeywords && (
            <span
              title="Injects the active project's keywords into every run"
              className="shrink-0 rounded-[5px] bg-amber-500/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-amber-600 dark:text-amber-400"
            >
              KEYWORDS
            </span>
          )}
          <span className="truncate">
            {pinnedVersion !== null && `Using v${pinnedVersion} · `}
            {prompt.versionCount} version{prompt.versionCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-card hover:text-foreground hover:shadow-sm"
        title="History & versions"
      >
        <SlidersHorizontal className="size-3.5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-colors group-hover:opacity-100 hover:bg-card hover:text-foreground"
        title="Delete prompt"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
