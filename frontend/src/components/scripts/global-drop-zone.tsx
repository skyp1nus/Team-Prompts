"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createProjectFromUpload } from "@/lib/api/uploads";
import { invalidatePath } from "@/lib/query/invalidate";
import { useWorkspace } from "@/lib/workspace/workspace-context";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Drop a PDF/TXT anywhere on the page to create a project — no button needed. While a file is dragged
 * over the window the background blurs and a drop prompt appears. Native HTML5 drag only, so it never
 * collides with the app's dnd-kit (pointer-based) reordering.
 */
export function GlobalDropZone() {
  const qc = useQueryClient();
  const { activeWorkspaceId, setActiveScriptId, setProjectExpanded, selectBatchScript, applyRunSetup } =
    useWorkspace();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  // dragenter/leave fire per element — count depth so moving across children doesn't flicker the overlay.
  const depth = useRef(0);

  useEffect(() => {
    const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault(); // allow the drop + show the copy cursor
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!/\.(pdf|txt)$/i.test(file.name)) {
        toast.error("Only PDF or TXT files are supported");
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error("File is too large (max 20 MB)");
        return;
      }
      if (!activeWorkspaceId) {
        toast.error("Pick a workspace first");
        return;
      }

      setBusy(true);
      try {
        const project = await createProjectFromUpload(file, activeWorkspaceId);
        await invalidatePath(qc, "/api/script-projects", "/api/scripts");
        setProjectExpanded(project.id, true);
        if (project.originalScriptId) {
          setActiveScriptId(project.originalScriptId);
          // Default the new source to "use as context" (checked) so generation isn't blocked.
          selectBatchScript(project.originalScriptId);
          // Inherit the previous scenario's prompt+model selection so the new script is run-ready (#12).
          applyRunSetup();
        }
        toast.success("Project created");
      } catch {
        toast.error("Upload failed");
      } finally {
        setBusy(false);
      }
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [qc, activeWorkspaceId, setActiveScriptId, setProjectExpanded, selectBatchScript, applyRunSetup]);

  if (!dragging && !busy) return null;

  return (
    // pointer-events-none so the overlay never receives drag events itself — the window listeners do
    // all the work and the depth counter stays accurate.
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-background/55 p-8 backdrop-blur-md duration-150 animate-in fade-in-0">
      <div className="flex w-[min(480px,92vw)] flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary/50 bg-card/80 px-8 py-12 text-center shadow-2xl">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {busy ? <Loader2 className="size-7 animate-spin" /> : <FileUp className="size-7" />}
        </span>
        <div className="space-y-1.5">
          <p className="text-[18px] font-semibold">{busy ? "Creating project…" : "Drop to create a project"}</p>
          <p className="text-[13px] text-muted-foreground">
            {busy ? "Reading and extracting your file" : "Release a PDF or TXT anywhere — we’ll take it from here"}
          </p>
        </div>
      </div>
    </div>
  );
}
