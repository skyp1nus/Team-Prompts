"use client";

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { usePutApiScriptProjectsIdKeywords } from "@/api/endpoints/script-projects/script-projects";
import type { ScriptDto } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Edit a project's keyword list as removable chips — the per-project SEO terms keyword-aware prompts
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

        {/* Mounted only while open so the editor seeds its chips from the latest server text on each open. */}
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<string[]>(() => parseKeywords(initial));
  const [draft, setDraft] = useState("");

  const addTokens = (raw: string) => {
    const incoming = parseKeywords(raw);
    if (incoming.length === 0) return;
    setTags((prev) => {
      const seen = new Set(prev.map((t) => t.toLowerCase()));
      return [...prev, ...incoming.filter((t) => !seen.has(t.toLowerCase()))];
    });
    setDraft("");
  };

  const removeAt = (i: number) => setTags((prev) => prev.filter((_, idx) => idx !== i));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTokens(draft);
    } else if (e.key === "Backspace" && draft.length === 0 && tags.length > 0) {
      e.preventDefault();
      removeAt(tags.length - 1);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/[\n,]/.test(text)) {
      e.preventDefault();
      addTokens(`${draft},${text}`);
    }
  };

  const onSave = () => {
    // Fold any half-typed draft into the list before saving.
    const seen = new Set(tags.map((t) => t.toLowerCase()));
    const final = [...tags, ...parseKeywords(draft).filter((t) => !seen.has(t.toLowerCase()))];
    save.mutate(
      { id: projectId, data: { content: final.join("\n") } },
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
        {/* Chips field: looks like an input, focuses the inline editor on click. */}
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex max-h-[280px] min-h-[132px] flex-wrap content-start gap-1.5 overflow-y-auto rounded-lg border border-border bg-transparent p-2.5 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30"
        >
          {tags.map((t, i) => (
            <Badge key={`${t}-${i}`} variant="secondary" className="h-6 gap-1 pr-1 pl-2 text-[12px] font-normal">
              <span className="max-w-[220px] truncate">{t}</span>
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                className="flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => addTokens(draft)}
            placeholder={tags.length === 0 ? "Type a keyword, press Enter…" : ""}
            autoFocus
            className="h-6 min-w-[140px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </div>
        <p className="mt-2 flex items-center justify-between text-[11px] leading-relaxed text-faint">
          <span>Press Enter or comma to add · Backspace to remove the last.</span>
          <span className="shrink-0 tabular-nums">{tags.length}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-6 py-3.5">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save keywords"}
        </Button>
      </div>
    </>
  );
}
