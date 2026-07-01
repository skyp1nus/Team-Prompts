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
import { GripVertical, Network, PanelRightClose, SlidersHorizontal, Tags, TriangleAlert, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { invalidatePath } from "@/lib/query/invalidate";
import { useWorkspace } from "@/lib/workspace/workspace-context";

// value→label map so the Base UI Select trigger renders the capitalized label instead of the raw
// lowercase value ("summary"). Base UI reads the trigger text from `items`, not the mounted children.
const FILTER_ITEMS = [
  { label: "All prompts", value: "all" },
  { label: "Main Scripts", value: "main" },
  { label: "Summary", value: "summary" },
  { label: "Unique", value: "unique" },
] as const;

export function PromptsPanel() {
  const qc = useQueryClient();
  // Members see prompt names here (to pick for a run) but not content: no create/open/edit/reorder.
  // Only Owner/Admin may delete. (Viewers never reach this panel — app-shell hides it.)
  const { canEditPrompts, isPrivileged } = useAuth();
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
  // "summary" = the master Summary (its own filter); "unique" = Tags + Description; "main" = the team's
  // MainScripts library; "all" = everything.
  const [filter, setFilter] = useState<"all" | "main" | "summary" | "unique">("all");

  // The master Summary is auto-resolved + stable (no manual flag): the workspace's OLDEST Summary-kind
  // prompt — the same rule the backend uses. Pinned to the top of the library with a frame; one per
  // workspace; not selectable for a run (it auto-runs as the mind map).
  const masterSummary = useMemo(() => {
    const summaries = (prompts ?? []).filter((p) => p.kind === PromptKind.Summary);
    if (summaries.length === 0) return null;
    return [...summaries].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.id.localeCompare(b.id))[0];
  }, [prompts]);
  const masterSummaryId = masterSummary?.id ?? null;

  // Self-heal a persisted selection: keep only ids that still exist AND are runnable. Summary-KIND
  // prompts are mind-map builders (their output IS the Summary node) — never a manual run — so they're
  // excluded here too, dropping any stale selection of one that would otherwise be a silent no-op.
  useEffect(() => {
    if (prompts) prunePrompts(prompts.filter((p) => p.kind !== PromptKind.Summary).map((p) => p.id));
  }, [prompts, prunePrompts]);

  // The two workspace-static prompts — configured here (their content is seeded empty), run from the
  // Tags & Description mind map. Pinned like the master Summary, kept out of the sortable/selectable list.
  const tagsPrompt = useMemo(() => (prompts ?? []).find((p) => p.kind === PromptKind.Tags) ?? null, [prompts]);
  const descriptionPrompt = useMemo(
    () => (prompts ?? []).find((p) => p.kind === PromptKind.Description) ?? null,
    [prompts],
  );

  // The master Summary + Tags + Description are rendered as pinned "Unique" cards on top — keep all of
  // them out of the sortable library list here. onDragEnd still indexes into the full `prompts` list.
  const isStatic = (p: PromptListItemDto) =>
    p.kind === PromptKind.Tags || p.kind === PromptKind.Description;
  const showSummary = filter === "all" || filter === "summary";
  const showUnique = filter === "all" || filter === "unique";
  // The sortable library list, scoped to the active filter. "Summary" is a single type — the
  // Summary-KIND prompts (the master pins to the top; the rest list here). Everything else is MAIN.
  //  · summary → kind === Summary (non-master)
  //  · main    → kind === MainScripts
  //  · unique  → none (Tags/Description render as pinned cards, not here)
  //  · all     → every non-pinned prompt
  const sortable = (prompts ?? []).filter((p) => {
    if (p.id === masterSummaryId || isStatic(p)) return false;
    if (filter === "summary") return p.kind === PromptKind.Summary;
    if (filter === "main") return p.kind === PromptKind.MainScripts;
    if (filter === "unique") return false;
    return true; // "all"
  });
  const masterSummaryShown = !!masterSummary && showSummary;
  const tagsShown = !!tagsPrompt && showUnique;
  const descriptionShown = !!descriptionPrompt && showUnique;
  const anyStaticShown = masterSummaryShown || tagsShown || descriptionShown;
  const sortableShown = sortable.length > 0;

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
          {canEditPrompts && <CreatePromptDialog />}
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
        <Select
          items={FILTER_ITEMS}
          value={filter}
          onValueChange={(v) => v && setFilter(v as "all" | "main" | "summary" | "unique")}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Filter prompts" />
          </SelectTrigger>
          <SelectContent>
            {FILTER_ITEMS.map((it) => (
              <SelectItem key={it.value} value={it.value}>
                {it.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2.5 pb-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-1 h-[54px] w-full" />)}

          {/* the workspace's single master Summary — pinned + framed (only when not filtered out) */}
          {!isLoading && masterSummaryShown && masterSummary && (
            <MasterSummaryRow
              prompt={masterSummary}
              canEdit={canEditPrompts}
              onOpen={() => setOpenPromptId(masterSummary.id)}
            />
          )}

          {/* the two workspace-static prompts — configured here; burn amber until they have content */}
          {!isLoading && tagsShown && tagsPrompt && (
            <StaticPromptRow
              prompt={tagsPrompt}
              canEdit={canEditPrompts}
              onOpen={() => setOpenPromptId(tagsPrompt.id)}
            />
          )}
          {!isLoading && descriptionShown && descriptionPrompt && (
            <StaticPromptRow
              prompt={descriptionPrompt}
              canEdit={canEditPrompts}
              onOpen={() => setOpenPromptId(descriptionPrompt.id)}
            />
          )}

          {!isLoading && !sortableShown && !anyStaticShown && (
            <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-faint">
              {filter === "main"
                ? "No Main Scripts prompts yet."
                : filter === "summary"
                  ? "No summary prompts yet."
                  : filter === "unique"
                    ? "No unique prompts yet."
                    : "No prompts yet."}
              <br />
              {filter === "unique" || filter === "summary" ? "Switch the filter." : "Create one to begin."}
            </p>
          )}
          {sortableShown && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sortable.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {sortable.map((p) => (
                  <PromptRow
                    key={p.id}
                    prompt={p}
                    selected={selectedPromptIds.includes(p.id)}
                    pinnedVersion={promptVersions[p.id]?.number ?? null}
                    canEdit={canEditPrompts}
                    canDelete={isPrivileged}
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
  canEdit,
  onOpen,
}: {
  prompt: PromptListItemDto;
  /** Owner/Admin/PromptEditor — may open the content/versions dialog to set it up. */
  canEdit: boolean;
  onOpen: () => void;
}) {
  const unconfigured = prompt.isConfigured === false;
  return (
    <div
      onClick={canEdit ? onOpen : undefined}
      title={
        unconfigured
          ? "Not set up yet — click to write the Summary prompt"
          : "The mind-map source — auto-runs on each script's first generation"
      }
      className={cn(
        "group relative mb-2 flex items-start gap-2 rounded-lg border-[1.5px] p-2.5 transition-colors",
        unconfigured
          ? "border-warn/60 bg-warn/[0.07]"
          : "border-violet-400/70 bg-violet-500/[0.05]",
        canEdit && "cursor-pointer",
        canEdit && (unconfigured ? "hover:bg-warn/[0.12]" : "hover:bg-violet-500/[0.09]"),
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md",
          unconfigured ? "bg-warn/20 text-warn" : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
        )}
      >
        {unconfigured ? <TriangleAlert className="size-3.5" /> : <Network className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-[13px] font-semibold">{prompt.name}</span>
        <div className="mt-[3px] flex items-center gap-1.5 text-[11px] text-faint">
          {unconfigured ? (
            <span className="flex items-center gap-1 font-semibold text-warn">
              <TriangleAlert className="size-3" /> Not set up — needs a prompt
            </span>
          ) : (
            <>
              <span className="shrink-0 rounded-[5px] bg-violet-500/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-violet-600 dark:text-violet-400">
                MIND MAP · MASTER
              </span>
              <span className="truncate">
                auto-runs · {prompt.versionCount} version{prompt.versionCount === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </div>
      {canEdit && (
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
      )}
    </div>
  );
}

/** A workspace-static prompt (Tags / Description) pinned at the top of the library. Configured here
 *  (its content is seeded empty); run only from the Tags & Description mind map. Burns amber with a
 *  warning while it has no instructions yet, so the team knows to set it up. Not selectable, not draggable.
 *  Non-deletable — only editable (open to configure) by Owner/Admin/PromptEditor. */
function StaticPromptRow({ prompt, canEdit, onOpen }: { prompt: PromptListItemDto; canEdit: boolean; onOpen: () => void }) {
  const unconfigured = prompt.isConfigured === false;
  const label = prompt.kind === PromptKind.Tags ? "TAGS" : "DESCRIPTION";
  return (
    <div
      onClick={canEdit ? onOpen : undefined}
      title={
        unconfigured
          ? "Not set up yet — click to write this prompt"
          : "Tags & Description mind map prompt — click to edit"
      }
      className={cn(
        "group relative mb-2 flex items-start gap-2 rounded-lg border-[1.5px] p-2.5 transition-colors",
        unconfigured
          ? "border-warn/60 bg-warn/[0.07]"
          : "border-primary/25 bg-primary/[0.04]",
        canEdit && "cursor-pointer",
        canEdit && (unconfigured ? "hover:bg-warn/[0.12]" : "hover:bg-primary/[0.08]"),
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md",
          unconfigured ? "bg-warn/20 text-warn" : "bg-primary/12 text-primary",
        )}
      >
        {unconfigured ? <TriangleAlert className="size-3.5" /> : <Tags className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">{prompt.name}</span>
          <span className="shrink-0 rounded-[5px] bg-primary/[0.08] px-1.5 py-px text-[9px] font-bold tracking-wide text-primary">
            {label}
          </span>
        </div>
        <div className="mt-[3px] flex items-center gap-1.5 text-[11px] text-faint">
          {unconfigured ? (
            <span className="flex items-center gap-1 font-semibold text-warn">
              <TriangleAlert className="size-3" /> Not set up — needs a prompt
            </span>
          ) : (
            <span className="truncate">
              Ready · {prompt.versionCount} version{prompt.versionCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-card hover:text-foreground hover:shadow-sm"
          title="Configure"
        >
          <SlidersHorizontal className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function PromptRow({
  prompt,
  selected,
  pinnedVersion,
  canEdit,
  canDelete,
  onToggle,
  onOpen,
  onDelete,
}: {
  prompt: PromptListItemDto;
  selected: boolean;
  /** "vN" pinned for the next run, or null to follow Main. */
  pinnedVersion: number | null;
  /** Owner/Admin/PromptEditor — may reorder + open content/versions. */
  canEdit: boolean;
  /** Owner/Admin — may delete. */
  canDelete: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const hasMain = !!prompt.mainVersionId;
  // Summary-KIND prompts are mind-map builders, not runnable lanes — not selectable for a run (the master
  // auto-runs as the mind map; any other Summary-kind prompt is represented by the Summary node too).
  // Clicking one opens its detail instead of arming a run that the backend would silently skip.
  const selectable = prompt.kind !== PromptKind.Summary;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prompt.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={selectable ? onToggle : onOpen}
      title={selectable ? undefined : "Mind-map builder — represented by the Summary node, not a manual run"}
      className={cn(
        "group relative mb-[3px] flex cursor-pointer items-start gap-1.5 rounded-lg p-2.5 transition-colors hover:bg-accent",
        selectable && selected && "bg-primary/[0.07]",
        isDragging && "z-10 opacity-60",
      )}
    >
      {/* Reorder handle — PromptEditor+ only. Members select but can't reorder the shared library. */}
      {canEdit && (
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
      )}
      {selectable ? (
        <span
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] text-[11px] transition-colors",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
          )}
        >
          {selected && "✓"}
        </span>
      ) : (
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-violet-500/12 text-violet-600 dark:text-violet-400">
          <Network className="size-3.5" />
        </span>
      )}
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
          {/* SUMMARY is a single type — only Summary-KIND prompts carry it. Everything else is MAIN. */}
          {prompt.kind === PromptKind.Summary ? (
            <span
              title="Summary — transforms a script into the mind-map Summary"
              className="shrink-0 rounded-[5px] bg-violet-500/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-violet-600 dark:text-violet-400"
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
      {canEdit && (
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
      )}
      {canDelete && (
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
      )}
    </div>
  );
}
