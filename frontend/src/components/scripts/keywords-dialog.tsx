"use client";

import { useQueryClient } from "@tanstack/react-query";
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

/** Split free text (newline- or comma-separated) into a clean, de-duplicated keyword list. */
function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const k = part.trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/**
 * Edit a project's keyword list as plain text — the per-project SEO terms keyword-aware prompts
 * inject into their generations. One keyword Script per project; empty clears it. Saving lazily
 * creates it for legacy projects that predate the feature.
 */
export function KeywordsDialog({
  projectId,
  projectName,
  keywords,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  keywords: ScriptDto | null;
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

        {/* Mounted only while open so the editor seeds its text from the latest server value on each open. */}
        {open && (
          <KeywordsEditor
            projectId={projectId}
            initial={keywords?.extractedText ?? ""}
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
  onClose,
}: {
  projectId: string;
  initial: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = usePutApiScriptProjectsIdKeywords();
  // The saved keyword text, shown in full and edited directly.
  const [text, setText] = useState(initial);

  const count = parseKeywords(text).length;
  // Compare the normalized form so reformatting whitespace alone doesn't count as a change.
  const normalized = parseKeywords(text).join("\n");
  const dirty = normalized !== parseKeywords(initial).join("\n");

  const onSave = () => {
    save.mutate(
      { id: projectId, data: { content: normalized } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/script-projects");
          toast.success("Keywords saved");
          onClose();
        },
        onError: () => toast.error("Could not save keywords"),
      },
    );
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="One keyword per line…"
          className="max-h-[340px] min-h-[180px] resize-none text-[13px] leading-relaxed"
        />
        <p className="mt-2 flex items-center justify-between text-[11px] leading-relaxed text-faint">
          <span>One keyword per line or comma-separated.</span>
          <span className="shrink-0 tabular-nums">{count}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-6 py-3.5">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={save.isPending || !dirty}>
          {save.isPending ? "Saving…" : "Save keywords"}
        </Button>
      </div>
    </>
  );
}
