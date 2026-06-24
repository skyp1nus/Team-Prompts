"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Heart, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteApiResultsResultIdFavorite,
  useDeleteApiResultsResultIdHighlight,
  usePostApiResultsResultIdCopy,
  usePostApiResultsResultIdFavorite,
  usePostApiResultsResultIdHighlight,
} from "@/api/endpoints/results/results";
import type { GenerationResultDto, UserRef } from "@/api/model";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

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
  const { showHighlightsOnly } = useWorkspace();
  const fav = usePostApiResultsResultIdFavorite();
  const unfav = useDeleteApiResultsResultIdFavorite();
  const highlight = usePostApiResultsResultIdHighlight();
  const unhighlight = useDeleteApiResultsResultIdHighlight();
  const copyEvent = usePostApiResultsResultIdCopy();

  const content = result?.content ?? liveText ?? "";
  const isFav = result?.isFavorite ?? false;
  const isHi = result?.isHighlighted ?? false;
  const hiBy = result?.highlightedBy as UserRef | null | undefined;
  // When the highlights filter is on, anything not highlighted fades back (still hover-revealable).
  const dimmed = showHighlightsOnly && !isHi;

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

  const toggleHighlight = () => {
    if (!result) return;
    (isHi ? unhighlight : highlight).mutate(
      { resultId: result.id },
      {
        onSuccess: () => {
          invalidate();
          toast.success(isHi ? "Highlight removed" : "Highlighted for the team");
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
      <div className={cn("rounded-xl border border-border bg-card p-3.5", dimmed && "opacity-30")}>
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
        "group/card animate-rise relative cursor-pointer rounded-xl border border-border bg-card p-3.5 transition-[border-color,transform,opacity] hover:border-border-strong active:scale-[0.992]",
        isFav && "border-primary bg-primary/[0.06]",
        isHi && "ring-1 ring-rose-400/60",
        dimmed && "opacity-30 hover:opacity-100",
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
          {isHi && hiBy && <> · ♥ {hiBy.displayName}</>}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleHighlight();
            }}
            title={
              isHi
                ? hiBy
                  ? `Highlighted by ${hiBy.displayName} — click to remove`
                  : "Remove highlight"
                : "Highlight this result for the team"
            }
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors",
              isHi ? "text-rose-500" : "text-faint hover:bg-accent hover:text-rose-500",
            )}
          >
            <Heart className={cn("size-3", isHi && "fill-current")} /> {isHi ? "Highlighted" : "Highlight"}
          </button>
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
    </div>
  );
}
