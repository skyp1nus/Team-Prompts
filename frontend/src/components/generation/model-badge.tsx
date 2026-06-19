import { modelLabel } from "@/lib/format";
import { providerDot } from "@/lib/models";
import { cn } from "@/lib/utils";

export function ModelBadge({ model, small }: { model: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-background font-medium whitespace-nowrap text-muted-foreground",
        small ? "gap-1 px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: providerDot(model) }} />
      {modelLabel(model)}
    </span>
  );
}
