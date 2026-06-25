"use client";

import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Slim vertical rail rendered in place of a collapsed Scripts/Prompts panel — click anywhere on it
 * to expand. Mirrors the shadcn `SidebarRail` affordance (full-height hit target + edge hover line),
 * adapted to our resizable 3-pane layout where the panel itself collapses to width 0.
 */
export function CollapsedRail({
  side,
  label,
  onExpand,
}: {
  side: "left" | "right";
  label: string;
  onExpand: () => void;
}) {
  const Icon = side === "left" ? PanelLeftOpen : PanelRightOpen;

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${label} panel`}
      title={`Expand ${label}`}
      className={cn(
        "group/rail relative flex w-11 shrink-0 cursor-pointer flex-col items-center gap-3 bg-background py-3.5",
        "text-faint transition-colors hover:bg-accent hover:text-foreground",
        // edge hover line — the shadcn rail tell
        "after:absolute after:inset-y-0 after:w-px after:bg-transparent hover:after:bg-border",
        "animate-in fade-in-0 duration-200",
        side === "left"
          ? "border-r border-border slide-in-from-left-2 after:right-0"
          : "border-l border-border slide-in-from-right-2 after:left-0",
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm transition-colors group-hover/rail:bg-accent">
        <Icon className="size-4" />
      </span>
      <span className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase [writing-mode:vertical-rl] group-hover/rail:text-foreground">
        {label}
      </span>
    </button>
  );
}
