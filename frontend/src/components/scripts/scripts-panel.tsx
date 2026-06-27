"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Eye, Folder, Loader2, MoreHorizontal, PanelLeftClose, Search, Sparkles, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useDeleteApiScriptProjectsId,
  useDeleteApiScriptProjectsIdVariantsVariantId,
  useGetApiScriptProjects,
  useGetApiScriptProjectsId,
} from "@/api/endpoints/script-projects/script-projects";
import { FileType, type ScriptDto, ScriptKind, type ScriptProjectListItemDto, SessionStatus } from "@/api/model";
import { GenerateVariantDialog } from "@/components/scripts/generate-variant-dialog";
import { ScriptViewerDialog } from "@/components/scripts/script-viewer-dialog";
import { UploadDialog } from "@/components/scripts/upload-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelative } from "@/lib/format";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

function inProgress(s: ScriptDto["variantStatus"]) {
  return s === SessionStatus.Queued || s === SessionStatus.Streaming;
}

export function ScriptsPanel() {
  const [search, setSearch] = useState("");
  const { activeWorkspaceId, expandedProjectIds, setScriptsPanelCollapsed } = useWorkspace();

  const params = { workspaceId: activeWorkspaceId, ...(search.trim() ? { search: search.trim() } : {}) };
  const { data: projects, isLoading } = useGetApiScriptProjects(params, {
    query: { enabled: !!activeWorkspaceId },
  });

  return (
    <aside className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
        <h2 className="eyebrow">Projects</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-faint">{projects?.length ?? 0}</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setScriptsPanelCollapsed(true)}
                  aria-label="Collapse projects panel"
                >
                  <PanelLeftClose />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              Collapse
              <kbd
                data-slot="kbd"
                className="rounded border border-background/25 px-1 font-mono text-[10px] leading-4"
              >
                ⌘B
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="px-3.5 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
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

          {!isLoading && (projects?.length ?? 0) === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-faint">
              No projects yet.
              <br />
              Upload a PDF or TXT to start one.
            </p>
          )}

          {projects?.map((p) => (
            <ProjectFolder key={p.id} project={p} expanded={expandedProjectIds.includes(p.id)} />
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

function ProjectFolder({ project, expanded }: { project: ScriptProjectListItemDto; expanded: boolean }) {
  const qc = useQueryClient();
  const { activeScriptId, setActiveScriptId, batchScriptIds, toggleBatchScript, setProjectExpanded } =
    useWorkspace();
  const delProject = useDeleteApiScriptProjectsId();
  const [genOpen, setGenOpen] = useState(false);

  const { data: detail, isLoading } = useGetApiScriptProjectsId(project.id, {
    query: {
      enabled: expanded,
      refetchInterval: (q) =>
        (q.state.data?.variants ?? []).some((v) => inProgress(v.variantStatus)) ? 2000 : false,
    },
  });

  // orval types a nullable nested ref as `unknown | null | ScriptDto`; narrow it once.
  const original = (detail?.original ?? null) as ScriptDto | null;

  const onOpenChange = (o: boolean) => {
    setProjectExpanded(project.id, o);
    if (o && project.originalScriptId) setActiveScriptId(project.originalScriptId);
  };

  const onDeleteProject = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${project.name}" and its generated variants?`)) return;
    delProject.mutate(
      { id: project.id },
      {
        onSuccess: async () => {
          if (activeScriptId) setActiveScriptId(null);
          await invalidatePath(qc, "/api/script-projects", "/api/scripts");
          toast.success("Project deleted");
        },
        onError: () => toast.error("Delete failed"),
      },
    );
  };

  return (
    <Collapsible open={expanded} onOpenChange={onOpenChange} className="mb-0.5">
      <div className="group relative flex items-center rounded-[9px] transition-colors hover:bg-accent">
        <CollapsibleTrigger
          render={
            <button className="flex min-w-0 flex-1 items-center gap-2 rounded-[9px] p-2.5 text-left" />
          }
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-faint transition-transform", expanded && "rotate-90")}
          />
          <Folder className="size-[18px] shrink-0 text-primary/80" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{project.name}</span>
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center pr-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label="Project actions"
                  title="More"
                  className="flex size-[22px] items-center justify-center rounded-md text-faint opacity-0 transition-colors group-hover:opacity-100 hover:bg-card hover:text-foreground data-[popup-open]:bg-card data-[popup-open]:text-foreground data-[popup-open]:opacity-100"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              }
            />
            <DropdownMenuContent align="center" className="w-auto min-w-[184px]">
              <DropdownMenuItem onClick={() => setGenOpen(true)} className="whitespace-nowrap px-2 py-1.5">
                <Sparkles />
                Generate variant
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={onDeleteProject}
                className="whitespace-nowrap px-2 py-1.5"
              >
                <X />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <GenerateVariantDialog projectId={project.id} open={genOpen} onOpenChange={setGenOpen} />

      <CollapsibleContent>
        <div className="ml-[18px] border-l border-border pl-2">
          {isLoading && <Skeleton className="my-1 h-9 w-full" />}
          {original && (
            <ScriptLeaf
              script={original}
              isSource
              active={original.id === activeScriptId}
              selected={batchScriptIds.includes(original.id)}
              onOpen={() => {
                toggleBatchScript(original.id);
                setActiveScriptId(original.id);
              }}
            />
          )}
          {detail?.variants.map((v) => (
            <ScriptLeaf
              key={v.id}
              script={v}
              active={v.id === activeScriptId}
              selected={batchScriptIds.includes(v.id)}
              onOpen={() => {
                toggleBatchScript(v.id);
                setActiveScriptId(v.id);
              }}
              projectId={project.id}
            />
          ))}
          {detail && !original && detail.variants.length === 0 && (
            <p className="px-2 py-2 text-[11.5px] text-faint">Empty project.</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ScriptLeaf({
  script,
  isSource,
  active,
  selected,
  onOpen,
  projectId,
}: {
  script: ScriptDto;
  /** True for the project's uploaded source script. */
  isSource?: boolean;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  /** Set for variant leaves → enables delete. Omitted for the source. */
  projectId?: string;
}) {
  const qc = useQueryClient();
  const { activeScriptId, setActiveScriptId, batchScriptIds, toggleBatchScript } = useWorkspace();
  const delVariant = useDeleteApiScriptProjectsIdVariantsVariantId();
  const [viewOpen, setViewOpen] = useState(false);

  const isVariant = script.kind === ScriptKind.Variant;
  const isPdf = script.fileType === FileType.Pdf;
  const busy = inProgress(script.variantStatus);
  const failed = script.variantStatus === SessionStatus.Failed;

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId) return;
    if (!confirm(`Delete "${script.name}"?`)) return;
    delVariant.mutate(
      { id: projectId, variantId: script.id },
      {
        onSuccess: async () => {
          if (activeScriptId === script.id) setActiveScriptId(null);
          if (batchScriptIds.includes(script.id)) toggleBatchScript(script.id);
          await invalidatePath(qc, "/api/script-projects");
          toast.success("Deleted");
        },
        onError: () => toast.error("Delete failed"),
      },
    );
  };

  return (
    <div
      onClick={onOpen}
      className={cn(
        "group/leaf relative my-[2px] flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 pl-2 transition-colors hover:bg-accent",
        active && "bg-primary/[0.07]",
      )}
    >
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded border-[1.5px] text-[10px] transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
        )}
      >
        {selected && <Check className="size-2.5" />}
      </span>

      <span
        className={cn(
          "flex size-[26px] shrink-0 items-center justify-center rounded-[6px] text-[8px] font-bold",
          isVariant
            ? "bg-primary/10 text-primary"
            : isPdf
              ? "bg-destructive/10 text-destructive"
              : "bg-ok/15 text-ok",
        )}
      >
        {isVariant ? "AI" : isPdf ? "PDF" : "TXT"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{script.name}</span>
          {isSource && (
            <span className="shrink-0 rounded-[5px] bg-primary/[0.1] px-1.5 py-px text-[9px] font-bold tracking-wide text-primary">
              SOURCE
            </span>
          )}
        </div>
        <div className="mt-px flex items-center gap-1 text-[10.5px] text-faint">
          {isVariant ? (
            busy ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Generating…
              </>
            ) : failed ? (
              <span className="flex items-center gap-1 text-destructive">
                <TriangleAlert className="size-3" /> Failed
              </span>
            ) : (
              <>AI draft · {formatRelative(script.updatedAt)}</>
            )
          ) : (
            <>Uploaded {isPdf ? "PDF" : "TXT"}</>
          )}
        </div>
      </div>

      {!busy && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setViewOpen(true);
          }}
          className="flex size-[20px] shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors group-hover/leaf:opacity-100 hover:text-foreground"
          title="View text"
        >
          <Eye className="size-3.5" />
        </button>
      )}
      {isVariant && !busy && (
        <button
          onClick={onDelete}
          className="flex size-[20px] shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors group-hover/leaf:opacity-100 hover:text-foreground"
          title="Delete"
        >
          <X className="size-3" />
        </button>
      )}

      <ScriptViewerDialog script={script} open={viewOpen} onOpenChange={setViewOpen} />
    </div>
  );
}
