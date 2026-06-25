"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MoreVertical, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useDeleteApiWorkspacesId,
  useGetApiWorkspaces,
} from "@/api/endpoints/workspaces/workspaces";
import type { WorkspaceDto } from "@/api/model";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceDialog } from "@/components/workspace/workspace-dialog";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { GENERAL_WORKSPACE_ID, useWorkspace } from "@/lib/workspace/workspace-context";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Seeded channel photos map to the seeded workspace IDs (not arbitrary keys) so a user-created
 * space whose key happens to be "G"/"B"/etc. never borrows a channel's avatar. */
const SEEDED_AVATARS: Record<string, string> = {
  "22222222-2222-2222-2222-222222222222": "/workspaces/tt.png",
  "33333333-3333-3333-3333-333333333333": "/workspaces/t.jpg",
  "44444444-4444-4444-4444-444444444444": "/workspaces/g.png",
  "55555555-5555-5555-5555-555555555555": "/workspaces/b.png",
};

function avatarSrc(ws: WorkspaceDto): string | null {
  // Custom upload: stable URL, so bust the browser cache on replace via the changing updatedAt.
  if (ws.avatarUrl) return `${API_BASE}${ws.avatarUrl}?v=${encodeURIComponent(ws.updatedAt)}`;
  return SEEDED_AVATARS[ws.id] ?? null;
}

type DialogState = { mode: "create" } | { mode: "edit"; workspace: WorkspaceDto } | null;

export function WorkspaceDock() {
  const qc = useQueryClient();
  const { activeWorkspaceId, selectWorkspace, dockCollapsed, toggleDockCollapsed } = useWorkspace();
  const { data: workspaces, isLoading } = useGetApiWorkspaces();
  const del = useDeleteApiWorkspacesId();
  const [dialog, setDialog] = useState<DialogState>(null);

  // Auto-heal a persisted active id that no longer exists (e.g. someone deleted that space).
  // Route through selectWorkspace so the gone space's script/prompt selections are cleared too.
  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;
    if (!workspaces.some((w) => w.id === activeWorkspaceId)) {
      const fallback = workspaces.find((w) => w.isSystem) ?? workspaces[0];
      selectWorkspace(fallback.id);
    }
  }, [workspaces, activeWorkspaceId, selectWorkspace]);

  const onDelete = (ws: WorkspaceDto) => {
    if (ws.isSystem) return;
    const moves = ws.scriptCount + ws.promptCount;
    const note = moves
      ? `\n\nIts ${ws.scriptCount} script(s) and ${ws.promptCount} prompt(s) move to General.`
      : "";
    if (!confirm(`Delete the "${ws.name}" space?${note}`)) return;
    del.mutate(
      { id: ws.id },
      {
        onSuccess: async () => {
          if (activeWorkspaceId === ws.id) selectWorkspace(GENERAL_WORKSPACE_ID);
          await invalidatePath(qc, "/api/workspaces", "/api/scripts", "/api/prompts");
          toast.success("Space deleted");
        },
        onError: () => toast.error("Delete failed"),
      },
    );
  };

  if (dockCollapsed) {
    return (
      <div className="flex w-[34px] shrink-0 flex-col items-center border-r border-border bg-background pt-3">
        <button
          onClick={toggleDockCollapsed}
          className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-foreground"
          title="Show spaces"
          aria-label="Show spaces"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    );
  }

  // System ("General") sits on top as a home; channels follow, ordered by the API's SortOrder.
  const ordered = workspaces ? [...workspaces].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const system = ordered.filter((w) => w.isSystem);
  const channels = ordered.filter((w) => !w.isSystem);

  return (
    <>
      <nav className="flex w-[60px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-background py-3">
        {isLoading && (
          <div className="flex flex-col items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="size-10 rounded-[13px]" />
            ))}
          </div>
        )}

        {system.map((ws) => (
          <DockItem
            key={ws.id}
            ws={ws}
            active={ws.id === activeWorkspaceId}
            onSelect={() => ws.id !== activeWorkspaceId && selectWorkspace(ws.id)}
            onEdit={() => setDialog({ mode: "edit", workspace: ws })}
            onDelete={() => onDelete(ws)}
          />
        ))}

        {system.length > 0 && channels.length > 0 && (
          <span className="my-0.5 h-px w-7 rounded-full bg-border" />
        )}

        {channels.map((ws) => (
          <DockItem
            key={ws.id}
            ws={ws}
            active={ws.id === activeWorkspaceId}
            onSelect={() => ws.id !== activeWorkspaceId && selectWorkspace(ws.id)}
            onEdit={() => setDialog({ mode: "edit", workspace: ws })}
            onDelete={() => onDelete(ws)}
          />
        ))}

        {/* add a new space */}
        <button
          onClick={() => setDialog({ mode: "create" })}
          className="mt-0.5 flex size-10 items-center justify-center rounded-[13px] border border-dashed border-border-strong text-faint transition-colors hover:border-primary hover:bg-primary/[0.06] hover:text-primary"
          title="New space"
          aria-label="New space"
        >
          <Plus className="size-[18px]" />
        </button>

        <div className="flex-1" />

        {/* collapse the dock */}
        <button
          onClick={toggleDockCollapsed}
          className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-foreground"
          title="Hide spaces"
          aria-label="Hide spaces"
        >
          <ChevronLeft className="size-4" />
        </button>
      </nav>

      <WorkspaceDialog
        state={dialog}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

function DockItem({
  ws,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  ws: WorkspaceDto;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const src = avatarSrc(ws);
  const label = ws.key || ws.name;

  const avatar = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={ws.name} className="size-full object-cover" />
  ) : ws.isSystem ? (
    <Sparkles className="size-[18px]" />
  ) : (
    <span className="uppercase">{label.slice(0, 2)}</span>
  );

  return (
    <div className="group/item relative flex w-full justify-center">
      {/* Discord-style left indicator pill: tall when active, a nub on hover. */}
      <span
        className={cn(
          "absolute top-1/2 left-0 w-[3px] -translate-y-1/2 rounded-r-full bg-foreground transition-all duration-150",
          active ? "h-6" : "h-0 group-hover/item:h-2.5",
        )}
      />

      <div className="relative">
        {/* Right-click selects nothing; it opens the same actions (Mac-dock feel). */}
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <button
                onClick={onSelect}
                title={ws.name}
                aria-label={ws.name}
                aria-pressed={active}
                className={cn(
                  "flex size-10 items-center justify-center overflow-hidden rounded-[13px] bg-accent text-[13px] font-bold text-muted-foreground transition-all duration-150 hover:scale-[1.06] hover:rounded-[11px]",
                  active
                    ? "rounded-[11px] ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "opacity-90 hover:opacity-100",
                )}
              />
            }
          >
            {avatar}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={onEdit}>
              <Pencil /> Edit
            </ContextMenuItem>
            {!ws.isSystem && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 /> Delete space
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>

        {/* Visible, keyboard-reachable affordance — the context menu alone is mouse-right-click only. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                onClick={(e) => e.stopPropagation()}
                title={`${ws.name} options`}
                aria-label={`${ws.name} options`}
                className="absolute -top-1 -right-1 z-10 flex size-[18px] items-center justify-center rounded-full bg-popover text-faint opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100 aria-expanded:opacity-100"
              />
            }
          >
            <MoreVertical className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            {!ws.isSystem && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 /> Delete space
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
