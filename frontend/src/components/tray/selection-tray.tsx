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
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, GripVertical, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useDeleteApiResultsResultIdFavorite,
  usePostApiResultsResultIdCopy,
} from "@/api/endpoints/results/results";
import { useGetApiScriptsIdTray } from "@/api/endpoints/scripts/scripts";
import type { TrayItemDto } from "@/api/model";
import { ModelBadge } from "@/components/generation/model-badge";
import { Button } from "@/components/ui/button";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export function SelectionTray() {
  const { activeScriptId } = useWorkspace();
  const qc = useQueryClient();
  const { data } = useGetApiScriptsIdTray(activeScriptId ?? "", { query: { enabled: !!activeScriptId } });
  const copyEvent = usePostApiResultsResultIdCopy();

  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    const ids = (data ?? []).map((t) => t.resultId);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const items = order
    .map((id) => (data ?? []).find((t) => t.resultId === id))
    .filter((x): x is TrayItemDto => !!x);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setOrder((prev) => arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string)));
    }
  };

  const copyAll = async () => {
    if (items.length === 0) return;
    try {
      await navigator.clipboard.writeText(items.map((t) => t.content).join("\n\n———\n\n"));
    } catch {
      toast.error("Couldn’t copy to clipboard");
      return;
    }
    items.forEach((t) => copyEvent.mutate({ resultId: t.resultId }));
    if (activeScriptId) invalidatePath(qc, `/api/scripts/${activeScriptId}/sessions`);
    toast.success(`Copied ${items.length} item${items.length === 1 ? "" : "s"}`);
  };

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="flex items-center gap-3 px-5 pt-2.5">
        <h3 className="eyebrow">Selection Tray</h3>
        <span
          className={cn(
            "rounded-md px-1.5 text-[11px] font-semibold tabular-nums",
            items.length ? "bg-primary text-primary-foreground" : "bg-accent text-faint",
          )}
        >
          {items.length}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-lg"
          onClick={copyAll}
          disabled={items.length === 0}
        >
          <Copy className="size-3.5" /> Copy all
        </Button>
      </div>
      <div className="px-5 pt-2.5 pb-3">
        {items.length === 0 ? (
          <p className="py-1.5 text-[12.5px] text-faint">
            Picked results collect here. Click a result&apos;s + to add it, then copy the titles &amp;
            descriptions you&apos;ll use.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={horizontalListSortingStrategy}>
              <div className="flex gap-2.5 overflow-x-auto pb-0.5">
                {items.map((t) => (
                  <TrayCard key={t.resultId} item={t} scriptId={activeScriptId!} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function TrayCard({ item, scriptId }: { item: TrayItemDto; scriptId: string }) {
  const qc = useQueryClient();
  const unfav = useDeleteApiResultsResultIdFavorite();
  const copyEvent = usePostApiResultsResultIdCopy();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.resultId,
  });

  const invalidate = () =>
    invalidatePath(qc, `/api/scripts/${scriptId}/sessions`, `/api/scripts/${scriptId}/tray`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.content);
    } catch {
      toast.error("Couldn’t copy to clipboard");
      return;
    }
    copyEvent.mutate({ resultId: item.resultId }, { onSuccess: invalidate });
    toast.success("Copied");
  };
  const remove = () => unfav.mutate({ resultId: item.resultId }, { onSuccess: invalidate });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "animate-rise flex w-[248px] shrink-0 flex-col rounded-[10px] border border-border bg-card p-3",
        isDragging && "opacity-60",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-faint">
        <button className="cursor-grab text-faint" {...attributes} {...listeners} aria-label="Drag to reorder">
          <GripVertical className="size-3" />
        </button>
        <span className="min-w-0 flex-1 truncate" title={item.promptName}>
          {item.promptName}
        </span>
        <ModelBadge model={item.model} small />
      </div>
      <p className="line-clamp-2 text-[12.5px] leading-snug font-semibold">{item.content}</p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          onClick={copy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy className="size-3" /> Copy
        </button>
        <button
          onClick={remove}
          className="flex size-6 items-center justify-center rounded-md border border-border text-faint transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Remove"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
