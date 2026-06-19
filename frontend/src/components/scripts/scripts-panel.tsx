"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDeleteApiScriptsId, useGetApiScripts } from "@/api/endpoints/scripts/scripts";
import { FileType, type ScriptListItemDto } from "@/api/model";
import { UploadDialog } from "@/components/scripts/upload-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export function ScriptsPanel() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const { activeScriptId, setActiveScriptId, batchScriptIds, toggleBatchScript } = useWorkspace();

  const { data: scripts, isLoading } = useGetApiScripts(
    search.trim() ? { search: search.trim() } : undefined,
  );
  const del = useDeleteApiScriptsId();

  const onDelete = (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its generations?`)) return;
    del.mutate(
      { id },
      {
        onSuccess: async () => {
          if (activeScriptId === id) setActiveScriptId(null);
          await invalidatePath(qc, "/api/scripts");
          toast.success("Script deleted");
        },
        onError: () => toast.error("Delete failed"),
      },
    );
  };

  const selCount = batchScriptIds.length;

  return (
    <aside className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
        <h2 className="eyebrow">Scripts</h2>
        <span className="text-[11px] text-faint">
          {selCount ? `${selCount} selected` : (scripts?.length ?? 0)}
        </span>
      </div>

      <div className="px-3.5 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scripts…"
            className="h-9 pr-7 pl-[30px] text-[12.5px]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Clear"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3.5 pb-2">
        <UploadDialog />
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2.5 pt-0.5 pb-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-1 h-[52px] w-full" />)}
          {!isLoading && (scripts?.length ?? 0) === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-faint">
              No scripts yet.
              <br />
              Upload a PDF or TXT to begin.
            </p>
          )}
          {scripts?.map((s) => (
            <ScriptRow
              key={s.id}
              script={s}
              active={s.id === activeScriptId}
              selected={batchScriptIds.includes(s.id)}
              onOpen={() => {
                toggleBatchScript(s.id);
                setActiveScriptId(s.id);
              }}
              onDelete={() => onDelete(s.id, s.name)}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

function ScriptRow({
  script,
  active,
  selected,
  onOpen,
  onDelete,
}: {
  script: ScriptListItemDto;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isPdf = script.fileType === FileType.Pdf;
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative mb-0.5 flex cursor-pointer items-start gap-2.5 rounded-[9px] p-2.5 transition-colors hover:bg-accent",
        active && "bg-primary/[0.07]",
      )}
    >
      <span
        className={cn(
          "mt-[5px] flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] text-[11px] transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
      <span
        className={cn(
          "flex size-[30px] shrink-0 items-center justify-center rounded-[7px] text-[9px] font-bold",
          isPdf ? "bg-destructive/10 text-destructive" : "bg-ok/15 text-ok",
        )}
      >
        {isPdf ? "PDF" : "TXT"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{script.name}</div>
        <div className="mt-0.5 text-[11px] text-faint">
          {isPdf ? "PDF" : "TXT"} · {script.sessionCount} gen · {formatRelative(script.updatedAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="flex size-[22px] shrink-0 items-center justify-center rounded-md text-faint opacity-50 transition-colors group-hover:opacity-100 hover:bg-accent hover:text-foreground"
        title="Remove"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
