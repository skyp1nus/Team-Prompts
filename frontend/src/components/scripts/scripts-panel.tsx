"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, ExternalLink, Folder, KeyRound, Link2, Loader2, MoreHorizontal, PanelLeftClose, Pencil, Search, Tags, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useDeleteApiScriptProjectsId,
  useDeleteApiScriptProjectsIdVariantsVariantId,
  useGetApiScriptProjects,
  useGetApiScriptProjectsId,
  usePutApiScriptProjectsId,
} from "@/api/endpoints/script-projects/script-projects";
import { FileType, type ScriptDto, ScriptKind, type ScriptProjectListItemDto, SessionStatus } from "@/api/model";
import { KeywordsDialog } from "@/components/scripts/keywords-dialog";
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
import { scriptFileUrl } from "@/lib/api/uploads";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRelative } from "@/lib/format";
import { invalidatePath } from "@/lib/query/invalidate";
import { projectShareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

function inProgress(s: ScriptDto["variantStatus"]) {
  return s === SessionStatus.Queued || s === SessionStatus.Streaming;
}

export function ScriptsPanel() {
  const [search, setSearch] = useState("");
  const { canGenerate } = useAuth();
  const { activeWorkspaceId, expandedProjectIds, focusedProjectId, setFocusedProject, setScriptsPanelCollapsed } =
    useWorkspace();

  const params = { workspaceId: activeWorkspaceId, ...(search.trim() ? { search: search.trim() } : {}) };
  const { data: projects, isLoading } = useGetApiScriptProjects(params, {
    query: { enabled: !!activeWorkspaceId },
  });

  // Shared-link focus: collapse the rail to a single project and hide the rest.
  const focusedProject = focusedProjectId ? projects?.find((p) => p.id === focusedProjectId) : undefined;
  const visibleProjects = focusedProjectId
    ? (projects ?? []).filter((p) => p.id === focusedProjectId)
    : projects;

  return (
    <aside className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
        <h2 className="eyebrow">Projects</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-faint">{visibleProjects?.length ?? 0}</span>
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

      {focusedProjectId ? (
        // Shared view: swap search + upload for a banner naming the one focused project + an exit.
        <div className="px-3.5 pb-2.5">
          <div className="flex items-center gap-2 rounded-[9px] border border-primary/30 bg-primary/[0.06] px-2.5 py-2">
            <Link2 className="size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold tracking-wide text-primary uppercase">Shared view</div>
              <div className="truncate text-[12px] text-faint">{focusedProject?.name ?? "One project"}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-[12px]"
              onClick={() => setFocusedProject(null)}
            >
              Show all
            </Button>
          </div>
        </div>
      ) : (
        <>
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

          {/* Upload (create project) — Member+ only. Viewer browses existing projects read-only. */}
          {canGenerate && (
            <div className="px-3.5 pb-2">
              <UploadDialog />
            </div>
          )}
        </>
      )}

      <ScrollArea className="flex-1">
        <div className="px-2.5 pt-0.5 pb-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-1 h-[52px] w-full" />)}

          {!isLoading && (visibleProjects?.length ?? 0) === 0 &&
            (focusedProjectId ? (
              // Focused on a project that isn't in this space (e.g. deleted) — offer a way back.
              <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-faint">
                This shared project isn’t available.
                <br />
                <button onClick={() => setFocusedProject(null)} className="text-primary hover:underline">
                  Show all projects
                </button>
              </p>
            ) : (
              <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-faint">
                No projects yet.
                <br />
                Upload a PDF or TXT to start one.
              </p>
            ))}

          {visibleProjects?.map((p) => (
            <ProjectFolder key={p.id} project={p} expanded={expandedProjectIds.includes(p.id)} />
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

function ProjectFolder({ project, expanded }: { project: ScriptProjectListItemDto; expanded: boolean }) {
  const qc = useQueryClient();
  const { canGenerate, isPrivileged } = useAuth();
  const {
    activeScriptId,
    setActiveScriptId,
    setTagsDescriptionProjectId,
    batchScriptIds,
    toggleBatchScript,
    setProjectExpanded,
  } = useWorkspace();
  const delProject = useDeleteApiScriptProjectsId();
  const renameProject = usePutApiScriptProjectsId();
  // null = not renaming. A string = the live draft, seeded from the current name when rename opens.
  const [draft, setDraft] = useState<string | null>(null);
  const renaming = draft !== null;

  const { data: detail, isLoading } = useGetApiScriptProjectsId(project.id, {
    query: {
      enabled: expanded,
      refetchInterval: (q) =>
        (q.state.data?.variants ?? []).some((v) => inProgress(v.variantStatus)) ? 2000 : false,
    },
  });

  // orval types a nullable nested ref as `unknown | null | ScriptDto`; narrow it once.
  const original = (detail?.original ?? null) as ScriptDto | null;
  const keywords = (detail?.keywords ?? null) as ScriptDto | null;

  const onOpenChange = (o: boolean) => {
    setProjectExpanded(project.id, o);
    if (o && project.originalScriptId) {
      setActiveScriptId(project.originalScriptId);
      setTagsDescriptionProjectId(null); // browsing a script leaves the Tags & Description mind map
    }
  };

  const onDeleteProject = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${project.name}" and its generated variants?`)) return;
    delProject.mutate(
      { id: project.id },
      {
        onSuccess: async () => {
          // Drop the deleted project's original from the batch selection + active view, so its (now
          // detached) script id never lingers checked and re-triggers a generation on the next run.
          const orig = project.originalScriptId;
          if (orig && batchScriptIds.includes(orig)) toggleBatchScript(orig);
          if (activeScriptId) setActiveScriptId(null);
          await invalidatePath(qc, "/api/script-projects", "/api/scripts");
          toast.success("Project deleted");
        },
        onError: () => toast.error("Delete failed"),
      },
    );
  };

  const onCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(projectShareUrl(project.id));
      toast.success("Share link copied");
    } catch {
      toast.error("Couldn’t copy link");
    }
  };

  const cancelRename = () => setDraft(null);
  const saveRename = () => {
    const next = (draft ?? "").trim();
    if (!next || next === project.name) {
      cancelRename();
      return;
    }
    renameProject.mutate(
      { id: project.id, data: { name: next } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/script-projects", "/api/scripts");
          toast.success("Project renamed");
          setDraft(null);
        },
        onError: () => toast.error("Rename failed"),
      },
    );
  };

  return (
    <Collapsible open={expanded} onOpenChange={onOpenChange} className="mb-0.5">
      <div className="group relative flex items-center rounded-[9px] transition-colors hover:bg-accent">
        {renaming ? (
          // Inline rename: replace the whole header row with an editable field so the click never
          // toggles the collapsible. Enter saves, Escape cancels, blur saves.
          <div className="flex min-w-0 flex-1 items-center gap-2 p-2.5">
            <Folder className="size-[18px] shrink-0 text-primary/80" />
            <Input
              autoFocus
              value={draft ?? ""}
              disabled={renameProject.isPending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={saveRename}
              className="h-7 text-[13px] font-medium"
              aria-label="Project name"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={saveRename}
              disabled={renameProject.isPending}
              aria-label="Save name"
              className="flex size-[22px] shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-card hover:text-foreground"
            >
              <Check className="size-4" />
            </button>
          </div>
        ) : (
          <>
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
            {/* Project actions — copy-share link is open to all; rename is Member+, delete is Owner/Admin. */}
            <div className="flex shrink-0 items-center pr-1.5">
              {/* Quick share: one click copies the project's deep link (opens the app focused here). */}
              <button
                type="button"
                onClick={onCopyLink}
                aria-label="Copy share link"
                title="Copy share link"
                className="flex size-[22px] items-center justify-center rounded-md text-faint opacity-0 transition-colors group-hover:opacity-100 hover:bg-card hover:text-foreground"
              >
                <Link2 className="size-3.5" />
              </button>
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
                  <DropdownMenuItem onClick={onCopyLink} className="whitespace-nowrap px-2 py-1.5">
                    <Link2 />
                    Copy share link
                  </DropdownMenuItem>
                  {canGenerate && (
                    <DropdownMenuItem
                      onClick={() => setDraft(project.name)}
                      className="whitespace-nowrap px-2 py-1.5"
                    >
                      <Pencil />
                      Rename
                    </DropdownMenuItem>
                  )}
                  {isPrivileged && (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={onDeleteProject}
                      className="whitespace-nowrap px-2 py-1.5"
                    >
                      <X />
                      Delete project
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>

      <CollapsibleContent>
        <div className="ml-[18px] border-l border-border pl-2">
          {isLoading && <Skeleton className="my-1 h-9 w-full" />}
          {original && (
            <ScriptLeaf
              script={original}
              isSource
              active={original.id === activeScriptId}
              selected={batchScriptIds.includes(original.id)}
            />
          )}
          {/* Variants are generated FROM the source — nest them under it as a tree so the lineage is obvious. */}
          {(detail?.variants.length ?? 0) > 0 && (
            <div className="ml-[17px]">
              {detail!.variants.map((v, i) => (
                <div
                  key={v.id}
                  className={cn(
                    "relative pl-3.5",
                    // vertical spine: full height for inner rows, stops at the tick for the last one
                    "before:absolute before:left-0 before:top-0 before:w-px before:bg-border before:content-['']",
                    i === detail!.variants.length - 1 ? "before:h-[22px]" : "before:h-full",
                    // horizontal tick into the row
                    "after:absolute after:left-0 after:top-[22px] after:h-px after:w-2.5 after:bg-border after:content-['']",
                  )}
                >
                  <ScriptLeaf
                    script={v}
                    active={v.id === activeScriptId}
                    selected={batchScriptIds.includes(v.id)}
                    projectId={project.id}
                  />
                </div>
              ))}
            </div>
          )}
          {detail && !original && detail.variants.length === 0 && (
            <p className="px-2 py-2 text-[11.5px] text-faint">Empty project.</p>
          )}
          {/* The project's editable keyword list — pinned to the bottom of the tree, fed to keyword-aware prompts. */}
          {detail && (
            <KeywordsLeaf projectId={project.id} projectName={project.name} keywords={keywords} />
          )}
          {/* The project's Tags & Description mind map (its own canvas with the two static prompts). */}
          {detail && (
            <TagsDescriptionLeaf
              projectId={project.id}
              projectName={project.name}
              originalScriptId={project.originalScriptId ?? original?.id ?? null}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function KeywordsLeaf({
  projectId,
  projectName,
  keywords,
}: {
  projectId: string;
  projectName: string;
  keywords: ScriptDto | null;
}) {
  const { canGenerate } = useAuth();
  const [open, setOpen] = useState(false);
  const isEmpty = (keywords?.extractedText ?? "").trim().length === 0;

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="group/leaf relative my-[2px] flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 pl-2 transition-colors hover:bg-accent"
      >
        {/* spacer aligns the icon with the source/variant rows (which lead with a checkbox) */}
        <span className="size-[18px] shrink-0" />
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-[6px] bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <KeyRound className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">Keywords</span>
          {/* empty → warn triangle; filled → nothing */}
          {isEmpty && (
            <span title="No keywords yet — click to add" className="flex shrink-0 text-warn">
              <TriangleAlert className="size-3.5" />
            </span>
          )}
        </div>
        {canGenerate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            className="flex size-[20px] shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors group-hover/leaf:opacity-100 hover:text-foreground"
            title="Edit keywords"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      <KeywordsDialog
        projectId={projectId}
        projectName={projectName}
        keywords={keywords}
        canEdit={canGenerate}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/** Row under Keywords that opens the project's "Tags & Description" mind map in the center (its own
 *  canvas with the two workspace-static prompts). Active-highlighted while that canvas is showing. */
function TagsDescriptionLeaf({
  projectId,
  projectName,
  originalScriptId,
}: {
  projectId: string;
  projectName: string;
  originalScriptId: string | null;
}) {
  const { setActiveScriptId, tagsDescriptionProjectId, setTagsDescriptionProjectId } = useWorkspace();
  const active = tagsDescriptionProjectId === projectId;
  const disabled = !originalScriptId;

  const open = () => {
    if (!originalScriptId) return;
    setActiveScriptId(originalScriptId); // sessions load off the Original; the two prompts run against it
    setTagsDescriptionProjectId(projectId);
  };

  return (
    <div
      onClick={open}
      title={disabled ? "Upload a source first" : `Tags & Description mind map for "${projectName}"`}
      className={cn(
        "group/leaf relative my-[2px] flex items-center gap-2 rounded-md py-1.5 pr-1.5 pl-2 transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent",
        active && "bg-primary/[0.07]",
      )}
    >
      {/* spacer aligns the icon with the source/variant rows (which lead with a checkbox) */}
      <span className="size-[18px] shrink-0" />
      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary">
        <Tags className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">Tags &amp; Description</span>
      <ChevronRight className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover/leaf:opacity-100" />
    </div>
  );
}

function ScriptLeaf({
  script,
  isSource,
  active,
  selected,
  projectId,
}: {
  script: ScriptDto;
  /** True for the project's uploaded source script. */
  isSource?: boolean;
  active: boolean;
  selected: boolean;
  /** Set for variant leaves → enables delete. Omitted for the source. */
  projectId?: string;
}) {
  const qc = useQueryClient();
  const { canGenerate, isPrivileged } = useAuth();
  const { activeScriptId, setActiveScriptId, setTagsDescriptionProjectId, batchScriptIds, toggleBatchScript } =
    useWorkspace();
  const delVariant = useDeleteApiScriptProjectsIdVariantsVariantId();

  const isVariant = script.kind === ScriptKind.Variant;
  const isPdf = script.fileType === FileType.Pdf;
  const busy = inProgress(script.variantStatus);
  const failed = script.variantStatus === SessionStatus.Failed;

  // Open the real uploaded PDF in its own standalone, movable browser window (a popup, not a tab) so
  // the native viewer shows the file's annotations. Same-site cookie authorises the GET. Re-using a
  // per-script window name focuses the existing window instead of spawning duplicates.
  const openOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(
      scriptFileUrl(script.id),
      `pdf-${script.id}`,
      "popup=yes,width=900,height=1000,resizable=yes,scrollbars=yes",
    );
  };

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
      onClick={() => {
        setActiveScriptId(script.id);
        setTagsDescriptionProjectId(null); // leaving the Tags & Description mind map to browse a script
      }}
      className={cn(
        "group/leaf relative my-[2px] flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 pl-2 transition-colors hover:bg-accent",
        active && "bg-primary/[0.07]",
      )}
    >
      {/* Batch-select checkbox arms a generation — Member+ only. Viewer gets an aligning spacer. */}
      {canGenerate ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? "Remove from batch" : "Add to batch"}
          onClick={(e) => {
            e.stopPropagation();
            toggleBatchScript(script.id);
          }}
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded border-[1.5px] text-[10px] transition-colors",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
          )}
        >
          {selected && <Check className="size-2.5" />}
        </button>
      ) : (
        <span className="size-[18px] shrink-0" />
      )}

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
        <div className="mt-px flex items-center gap-1 whitespace-nowrap text-[10.5px] text-faint">
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

      {/* Original PDFs carry their real markup (highlights, review notes) only in the source file —
          open the real bytes in a standalone, movable window where the native viewer renders them. */}
      {isPdf && !isVariant && (
        <button
          onClick={openOriginal}
          className="flex size-[20px] shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors group-hover/leaf:opacity-100 hover:text-foreground"
          title="Open original PDF (with annotations)"
        >
          <ExternalLink className="size-3.5" />
        </button>
      )}
      {isVariant && !busy && isPrivileged && (
        <button
          onClick={onDelete}
          className="flex size-[20px] shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors group-hover/leaf:opacity-100 hover:text-foreground"
          title="Delete"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
