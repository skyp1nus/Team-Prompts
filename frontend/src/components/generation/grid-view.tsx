"use client";

import { SessionStatus, type SessionWithResultsDto } from "@/api/model";
import { ModelBadge } from "@/components/generation/model-badge";
import { ResultCard } from "@/components/generation/result-card";
import { useGenerationStream } from "@/lib/realtime/generation-stream";
import type { Group } from "@/components/generation/map-view";

const DOTS = ["var(--primary)", "#2ea067", "#c98a1a", "#c43b54", "#2a7fd6", "#7b5bd6"];
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
  const ls = live[item.session.id];
  const status = (ls?.status ?? item.session.status) as string;
  const streaming = status === SessionStatus.Streaming || status === SessionStatus.Queued;
  const results = [...item.results].sort((a, b) => a.index - b.index);
  const liveCount = ls ? Object.keys(ls.deltas).length : 0;
  const total = streaming ? Math.max(VARIANTS, results.length, liveCount) : results.length;

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
        <span className="text-[13px] font-semibold">{item.session.promptName}</span>
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
      </div>
    </section>
  );
}
