"use client";

import { Check, Copy, FileText, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type ScriptDto, ScriptKind, SessionStatus } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Large centered viewer for a script's text — the uploaded source, or a generated alternative. */
export function ScriptViewerDialog({
  script,
  open,
  onOpenChange,
}: {
  script: ScriptDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isVariant = script.kind === ScriptKind.Variant;
  const busy = script.variantStatus === SessionStatus.Queued || script.variantStatus === SessionStatus.Streaming;
  const failed = script.variantStatus === SessionStatus.Failed;

  const text = script.extractedText ?? "";
  const hasText = text.trim().length > 0;
  const words = hasText ? text.trim().split(/\s+/).length : 0;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-h-[88vh] w-[94vw] max-w-[1040px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1040px]">
        {/* head */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-border bg-background px-6 py-4 pr-12">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                isVariant ? "bg-primary/10 text-primary" : "bg-ok/15 text-ok",
              )}
            >
              {isVariant ? <Sparkles className="size-[18px]" /> : <FileText className="size-[18px]" />}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-left text-[16px] leading-tight">{script.name}</DialogTitle>
              <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-left text-[12px]">
                <span>{isVariant ? "Generated alternative" : "Uploaded source"}</span>
                {isVariant && script.model && (
                  <>
                    <span className="text-border-strong">•</span>
                    <Badge variant="secondary" className="font-normal">
                      {script.model}
                    </Badge>
                  </>
                )}
                {isVariant && busy && (
                  <Badge variant="secondary" className="font-normal">
                    <Loader2 className="size-3 animate-spin" /> Generating
                  </Badge>
                )}
                {isVariant && failed && <Badge variant="destructive">Failed</Badge>}
                {!isVariant && (
                  <>
                    <span className="text-border-strong">•</span>
                    <span className="uppercase">{script.fileType}</span>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* body — the text as a paper-like document on a muted desk */}
        <ScrollArea className="min-h-0 flex-1 bg-muted/40">
          <div className="mx-auto max-w-[800px] px-6 py-8">
            {failed ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-[14px] text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{script.variantError ?? "Generation failed."}</span>
              </div>
            ) : busy ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-6 text-[14px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Generating the script…
              </div>
            ) : hasText ? (
              <article className="rounded-xl border border-border bg-background p-8 text-[15px] leading-[1.8] whitespace-pre-wrap shadow-sm">
                {text}
              </article>
            ) : (
              <div className="rounded-xl border border-dashed border-border-strong bg-background p-8 text-center text-[13px] text-faint">
                No text yet.
              </div>
            )}
          </div>
        </ScrollArea>

        {/* foot */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-background px-6 py-3.5">
          <span className="text-[12px] text-faint">
            {hasText ? `${words.toLocaleString()} word${words === 1 ? "" : "s"}` : "—"}
          </span>
          <Button onClick={onCopy} disabled={!hasText} className="h-9 gap-2 px-4">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy text"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
