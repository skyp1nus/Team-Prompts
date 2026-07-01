"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { usePostApiGenerationSessionsSessionIdRegenerate } from "@/api/endpoints/generation/generation";
import { SessionStatus, type SessionWithResultsDto } from "@/api/model";
import { ModelBadge } from "@/components/generation/model-badge";
import { ResultCard } from "@/components/generation/result-card";
import { VersionBadge } from "@/components/generation/version-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { invalidatePath } from "@/lib/query/invalidate";
import { useGenerationStream } from "@/lib/realtime/generation-stream";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { Group } from "@/components/generation/map-view";

const DOTS = ["var(--primary)", "var(--chart-2)", "var(--chart-1)", "var(--chart-4)", "var(--chart-3)", "var(--chart-5)"];
const VARIANTS = 5;

export function GridView({ groups, scriptId }: { groups: Group[]; scriptId: string }) {
  const sessions = groups.flatMap((g) => g.sessions);
  return (
    <div className="absolute inset-0 overflow-y-auto px-[22px] py-5">
      {sessions.map((s, i) => (
        <SessionSection key={s.session.id} item={s} scriptId={scriptId} dot={DOTS[i % DOTS.length]} />
      ))}
    </div>
  );
}

function SessionSection({
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
  const { promptVersions } = useWorkspace();
  const { canGenerate } = useAuth();
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
      {
        sessionId: item.session.id,
        // Pinned version for this prompt, else null = its current main (always the latest).
        data: { model: null, promptVersionId: promptVersions[item.session.promptId]?.versionId ?? null },
      },
      {
        onSuccess: () => invalidatePath(qc, `/api/scripts/${scriptId}/sessions`),
        onError: () => toast.error("Couldn’t retry"),
      },
    );
    toast.success("Retrying…");
  };

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
        <span className="text-[13px] font-semibold">{item.session.promptName}</span>
        <VersionBadge number={item.session.promptVersionNumber} isMain={item.session.isMainVersion} small />
        <ModelBadge model={item.session.model} small />
        <span className="text-[11px] text-faint">
          {streaming ? "generating…" : `${results.length} variants`}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
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
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-2 py-5 text-center">
            <p className="text-[11.5px] text-faint">
              {failed
                ? rateLimited
                  ? "Provider rate-limited (free tier)."
                  : "Generation failed."
                : "No results."}
            </p>
            {canGenerate && (
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
            )}
          </div>
        )}
      </div>
    </section>
  );
}
