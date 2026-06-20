"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { usePostApiGenerationSessionsSessionIdRegenerate } from "@/api/endpoints/generation/generation";
import { SessionStatus, type SessionWithResultsDto } from "@/api/model";
import { ResultCard } from "@/components/generation/result-card";
import { ModelBadge } from "@/components/generation/model-badge";
import { Button } from "@/components/ui/button";
import { invalidatePath } from "@/lib/query/invalidate";
import { useGenerationStream } from "@/lib/realtime/generation-stream";
import { cn } from "@/lib/utils";
import type { Group } from "@/components/generation/map-view";

const DOTS = ["var(--primary)", "var(--chart-2)", "var(--chart-1)", "var(--chart-4)", "var(--chart-3)", "var(--chart-5)"];
const VARIANTS = 5;

function flatten(groups: Group[]): SessionWithResultsDto[] {
  return groups.flatMap((g) => g.sessions);
}

export function ColumnsView({ groups, scriptId }: { groups: Group[]; scriptId: string }) {
  const sessions = flatten(groups);
  return (
    <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
      <div className="flex h-full w-max">
        {sessions.map((s, i) => (
          <SessionColumn key={s.session.id} item={s} scriptId={scriptId} dot={DOTS[i % DOTS.length]} />
        ))}
      </div>
    </div>
  );
}

function SessionColumn({
  item,
  scriptId,
  dot,
}: {
  item: SessionWithResultsDto;
  scriptId: string;
  dot: string;
}) {
  const { live } = useGenerationStream();
  const qc = useQueryClient();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const ls = live[item.session.id];
  const status = (ls?.status ?? item.session.status) as string;
  const streaming = status === SessionStatus.Streaming || status === SessionStatus.Queued;
  const failed = status === SessionStatus.Failed;
  const error = (ls?.error ?? item.session.error) ?? null;
  const rateLimited = !!error && error.includes("429");
  const results = [...item.results].sort((a, b) => a.index - b.index);
  const liveCount = ls ? Object.keys(ls.deltas).length : 0;
  const total = streaming ? Math.max(VARIANTS, results.length, liveCount) : results.length;

  const retry = () => {
    regen.mutate(
      { sessionId: item.session.id, data: { model: null } },
      {
        onSuccess: () => invalidatePath(qc, `/api/scripts/${scriptId}/sessions`),
        onError: () => toast.error("Couldn’t retry"),
      },
    );
    toast.success("Retrying…");
  };

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-r border-border">
      <div className="shrink-0 border-b border-border px-[18px] pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
          <span className="truncate text-[13px] font-semibold">{item.session.promptName}</span>
        </div>
        <div className="mt-1.5 ml-4 flex items-center gap-2">
          <ModelBadge model={item.session.model} small />
          <span className="text-[11px] text-faint">
            {streaming ? "generating…" : `${results.length} variants`}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: total }).map((_, i) => {
            const r = results.find((x) => x.index === i);
            return (
              <ResultCard
                key={r?.id ?? i}
                result={r}
                liveText={ls?.deltas[i]}
                streaming={streaming && !r}
                scriptId={scriptId}
              />
            );
          })}
          {!streaming && results.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
              <p className="text-[11.5px] text-faint">
                {failed
                  ? rateLimited
                    ? "Provider rate-limited (free tier)."
                    : "Generation failed."
                  : "No results."}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={retry}
                disabled={regen.isPending}
                className="h-7 gap-1.5 px-2.5 text-[11.5px]"
              >
                <RotateCw className={cn("size-3", regen.isPending && "animate-spin")} />
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
