"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { type ActivityEventDto, ActivityEventType, type ActivityTargetType, type UserRef } from "@/api/model";
import { ACTIVITY_META, formatCost, prettyMetadata, TONE_CLASS } from "@/lib/activity";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ActivityFeed({
  events,
  showActorLink = true,
}: {
  events: ActivityEventDto[];
  showActorLink?: boolean;
}) {
  if (events.length === 0)
    return <p className="py-10 text-center text-[13px] text-faint">No activity yet.</p>;

  return (
    <div className="flex flex-col">
      {events.map((e) => (
        <ActivityRow key={e.id} event={e} showActorLink={showActorLink} />
      ))}
    </div>
  );
}

function ActivityRow({ event, showActorLink }: { event: ActivityEventDto; showActorLink: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = ACTIVITY_META[event.type];
  const Icon = meta.icon;
  const actor = (event.actor ?? null) as UserRef | null;
  const targetType = (event.targetType ?? null) as ActivityTargetType | null;
  const isGen = event.type === ActivityEventType.GenerationCompleted;
  const details = prettyMetadata(event.metadata);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", TONE_CLASS[meta.tone])}>
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-snug">
            <b className="font-semibold">{actor?.displayName ?? "System"}</b>{" "}
            <span className="text-muted-foreground">{event.summary ?? meta.label.toLowerCase()}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
            <span className="rounded bg-accent px-1 py-px font-medium tracking-wide uppercase">{meta.label}</span>
            {event.model && <span className="truncate">{event.model}</span>}
            {isGen && <span className={cn("font-semibold", event.costUsd ? "text-foreground" : "")}>{formatCost(event.costUsd)}</span>}
            {event.totalTokens != null && <span>{event.totalTokens} tok</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] whitespace-nowrap text-faint">{formatRelative(event.createdAt)}</span>
          <ChevronRight className={cn("size-3.5 text-faint transition-transform", open && "rotate-90")} />
        </div>
      </button>

      {open && (
        <div className="animate-rise space-y-2.5 px-2 pb-3 pl-12 text-[12px]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
            <dt className="text-faint">When</dt>
            <dd>{new Date(event.createdAt).toLocaleString()}</dd>
            <dt className="text-faint">Action</dt>
            <dd>{event.type}</dd>
            {event.model && (
              <>
                <dt className="text-faint">Model</dt>
                <dd>{event.model}</dd>
              </>
            )}
            {isGen && (
              <>
                <dt className="text-faint">Cost</dt>
                <dd>{formatCost(event.costUsd)}</dd>
              </>
            )}
            {(event.promptTokens != null || event.completionTokens != null) && (
              <>
                <dt className="text-faint">Tokens</dt>
                <dd>
                  {event.promptTokens ?? 0} in · {event.completionTokens ?? 0} out · {event.totalTokens ?? 0} total
                </dd>
              </>
            )}
            {targetType && (
              <>
                <dt className="text-faint">Target</dt>
                <dd className="truncate">
                  {targetType}
                  {event.targetId ? ` · ${event.targetId}` : ""}
                </dd>
              </>
            )}
          </dl>

          {details && (
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {details}
            </pre>
          )}

          <div className="flex flex-wrap gap-x-4">
            {showActorLink && actor && (
              <Link
                href={`/users/${actor.id}`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
              >
                View {actor.displayName}&apos;s profile <ChevronRight className="size-3" />
              </Link>
            )}
            {targetType === "User" && event.targetUserId && (
              <Link
                href={`/users/${event.targetUserId}`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
              >
                View the user <ChevronRight className="size-3" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
