import { cn } from "@/lib/utils";

/** "vN · Main" tag showing which prompt version a generation ran with. When the number is unknown
 * (0) we still show "Main" if it's the main version (e.g. a just-promoted version never run in this
 * group); for a non-main unknown version (e.g. deleted) we render nothing. */
export function VersionBadge({
  number,
  isMain,
  small,
}: {
  number: number;
  isMain: boolean;
  small?: boolean;
}) {
  if (!number && !isMain) return null;
  const label = number ? `v${number}${isMain ? " · Main" : ""}` : "Main";
  return (
    <span
      title={isMain ? "Uses the team's Main version" : "Uses a pinned version"}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border font-medium whitespace-nowrap",
        isMain
          ? "border-primary/25 bg-primary/[0.07] text-primary"
          : "border-warn/30 bg-warn/10 text-warn",
        small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
      )}
    >
      {label}
    </span>
  );
}
