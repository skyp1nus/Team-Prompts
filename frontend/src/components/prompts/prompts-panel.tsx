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
import { GripVertical, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getGetApiPromptsQueryKey,
  useDeleteApiPromptsId,
  useGetApiPrompts,
  usePutApiPromptsReorder,
} from "@/api/endpoints/prompts/prompts";
import type { PromptListItemDto } from "@/api/model";
import { CreatePromptDialog } from "@/components/prompts/create-prompt-dialog";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { invalidatePath } from "@/lib/query/invalidate";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export function PromptsPanel() {
  const qc = useQueryClient();
  const { activeWorkspaceId, selectedPromptIds, togglePrompt, prunePrompts, promptVersions } =
    useWorkspace();
  const { data: prompts, isLoading } = useGetApiPrompts(
    { workspaceId: activeWorkspaceId },
    { query: { enabled: !!activeWorkspaceId } },
  );
  const del = useDeleteApiPromptsId();
  const reorder = usePutApiPromptsReorder();
  const [openPromptId, setOpenPromptId] = useState<string | null>(null);

  // Self-heal a persisted selection: drop any prompt id that no longer exists.
  useEffect(() => {
    if (prompts) prunePrompts(prompts.map((p) => p.id));
  }, [prompts, prunePrompts]);

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
        <CreatePromptDialog />
      </div>
      <div className="px-3.5 pb-2.5 text-[11px] text-faint">
        {n === 0 ? "No prompts selected" : `${n} prompt${n === 1 ? "" : "s"} selected`}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2.5 pb-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-1 h-[54px] w-full" />)}
          {!isLoading && (prompts?.length ?? 0) === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-faint">
              No prompts yet.
              <br />
              Create one to begin.
            </p>
          )}
          {prompts && prompts.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={prompts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {prompts.map((p) => (
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
        <div className="mt-[3px] text-[11px] text-faint">
          {pinnedVersion !== null ? `Using v${pinnedVersion} · ` : hasMain && "Main · "}
          {prompt.versionCount} version{prompt.versionCount === 1 ? "" : "s"}
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
