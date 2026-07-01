"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePutApiScriptProjectsIdKeywords } from "@/api/endpoints/script-projects/script-projects";
import type { ScriptDto } from "@/api/model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { invalidatePath } from "@/lib/query/invalidate";

/** Non-empty, trimmed keyword lines — one keyword per line, blank lines dropped. */
function cleanLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Edit a project's keyword list as plain text — the per-project SEO terms keyword-aware prompts
 * inject into their generations. One keyword Script per project; empty clears it. Saving lazily
 * creates it for legacy projects that predate the feature, and carries the keyword Script's
 * concurrency version so a stale save can't silently overwrite a teammate's edit.
 */
export function KeywordsDialog({
  projectId,
  projectName,
  keywords,
  canEdit = true,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  keywords: ScriptDto | null;
  /** Member+ may edit; Viewer opens it read-only. */
  canEdit?: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] w-[92vw] max-w-[600px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-6 py-4 pr-12">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <KeyRound className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-left text-[16px] leading-tight">Keywords</DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-left text-[12px]">
                Project “{projectName}” · injected into keyword-aware prompts
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Mounted only while open so the editor seeds its text + version from the latest server value
            on each open. */}
        {open && (
          <KeywordsEditor
            projectId={projectId}
            initial={keywords?.extractedText ?? ""}
            initialVersion={keywords?.version}
            canEdit={canEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function KeywordsEditor({
  projectId,
  initial,
  initialVersion,
  canEdit,
  onClose,
}: {
  projectId: string;
  initial: string;
  /** The keyword Script's concurrency version when this editor opened; undefined for a not-yet-created list. */
  initialVersion?: number;
  /** When false, the list is shown read-only (no editing, no Save). */
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = usePutApiScriptProjectsIdKeywords();
  // The saved keyword text, shown in full and edited directly.
  const [text, setText] = useState(initial);

  const count = cleanLines(text).length;
  // Raw compare: any edit arms Save; reopening an untouched (even messy) value leaves it disabled.
  const dirty = text !== initial;

  const onSave = () => {
    save.mutate(
      { id: projectId, data: { content: cleanLines(text).join("\n"), expectedVersion: initialVersion } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/script-projects");
          toast.success("Keywords saved");
          onClose();
        },
        onError: async (err) => {
          // 409 = someone saved newer keywords while this dialog was open. Don't clobber them —
          // refresh the underlying data and close so reopening shows the latest to reapply onto.
          if ((err as AxiosError)?.response?.status === 409) {
            const detail = ((err as AxiosError)?.response?.data as { detail?: string } | undefined)?.detail;
            toast.error(detail ?? "These keywords were changed by someone else. Reopen to see the latest.");
            await invalidatePath(qc, "/api/script-projects");
            onClose();
            return;
          }
          toast.error("Could not save keywords");
        },
      },
    );
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={canEdit}
          readOnly={!canEdit}
          placeholder="One keyword per line…"
          className="max-h-[340px] min-h-[180px] resize-none text-[13px] leading-relaxed read-only:opacity-80"
        />
        <p className="mt-2 flex items-center justify-between text-[11px] leading-relaxed text-faint">
          <span>{canEdit ? "One keyword per line. Blank lines are ignored." : "Read-only"}</span>
          <span className="shrink-0 tabular-nums">{count}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-6 py-3.5">
        <Button type="button" variant="ghost" onClick={onClose}>
          {canEdit ? "Cancel" : "Close"}
        </Button>
        {canEdit && (
          <Button type="button" onClick={onSave} disabled={save.isPending || !dirty}>
            {save.isPending ? "Saving…" : "Save keywords"}
          </Button>
        )}
      </div>
    </>
  );
}
