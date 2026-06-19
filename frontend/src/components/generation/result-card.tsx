"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteApiResultsResultIdFavorite,
  usePostApiResultsResultIdCopy,
  usePostApiResultsResultIdFavorite,
} from "@/api/endpoints/results/results";
import type { GenerationResultDto } from "@/api/model";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";

export function ResultCard({
  result,
  liveText,
  streaming,
  scriptId,
}: {
  result?: GenerationResultDto;
  liveText?: string;
  streaming?: boolean;
  scriptId: string;
}) {
  const qc = useQueryClient();
  const fav = usePostApiResultsResultIdFavorite();
  const unfav = useDeleteApiResultsResultIdFavorite();
  const copyEvent = usePostApiResultsResultIdCopy();

  const content = result?.content ?? liveText ?? "";
  const isFav = result?.isFavorite ?? false;

  const invalidate = () =>
    invalidatePath(qc, `/api/scripts/${scriptId}/sessions`, `/api/scripts/${scriptId}/tray`);

  const toggleFav = () => {
    if (!result) return;
    (isFav ? unfav : fav).mutate(
      { resultId: result.id },
      {
        onSuccess: () => {
          invalidate();
          toast.success(isFav ? "Removed from tray" : "Added to tray");
        },
      },
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      toast.error("Couldn’t copy to clipboard");
      return;
    }
    toast.success("Copied");
    if (result) copyEvent.mutate({ resultId: result.id }, { onSuccess: invalidate });
  };

  if (streaming && !result) {
    return (
      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="min-h-5 text-sm whitespace-pre-wrap">
          {content}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/60 align-text-bottom" />
        </p>
      </div>
    );
  }

  return (
    <div
      onClick={toggleFav}
      className={cn(
        "group/card animate-rise relative cursor-pointer rounded-xl border border-border bg-card p-3.5 transition-[border-color,transform] hover:border-border-strong active:scale-[0.992]",
        isFav && "border-primary bg-primary/[0.06]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <p className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold">{content}</p>
        <span
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-md border-[1.5px] text-[11px] transition-colors",
            isFav ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
          )}
        >
          {isFav ? <Check className="size-3" /> : <Plus className="size-3 text-faint" />}
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[10.5px] text-faint">
          {content.length} chars
          {result && result.favoriteCount > 0 && <> · ★ {result.favoriteCount}</>}
          {result && result.copyCount > 0 && <> · copied {result.copyCount}</>}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            copy();
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-faint transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy className="size-3" /> Copy
        </button>
      </div>
    </div>
  );
}
