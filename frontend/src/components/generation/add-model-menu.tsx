"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useGetApiSettings } from "@/api/endpoints/settings/settings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { providerDot } from "@/lib/models";
import { cn } from "@/lib/utils";

/** Clean single-select dropdown to add another favorite model to a prompt group. */
export function AddModelMenu({
  onPick,
  existing = [],
  disabled,
}: {
  onPick: (model: string) => void;
  existing?: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: settings } = useGetApiSettings();
  const all = settings?.availableModels ?? [];
  const favIds = settings?.favoriteModels ?? [];
  const favs = favIds.length > 0 ? all.filter((m) => favIds.includes(m.id)) : all;

  const pick = (id: string) => {
    setOpen(false);
    onPick(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            disabled={disabled}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          />
        }
      >
        <Plus className="size-3.5" /> Model
        <ChevronDown className="size-3 text-faint" />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[300px] w-[252px] overflow-y-auto p-1.5">
        <div className="eyebrow !text-[10px] px-2 pt-1 pb-1.5">Add a model</div>
        {favs.length === 0 ? (
          <p className="px-2 py-3 text-center text-[12px] leading-relaxed text-faint">
            No favorite models — set them in Settings.
          </p>
        ) : (
          favs.map((m) => {
            const used = existing.includes(m.id);
            return (
              <button
                key={m.id}
                disabled={used}
                onClick={() => pick(m.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent",
                  "disabled:opacity-40 disabled:hover:bg-transparent",
                )}
              >
                <span className="size-[7px] shrink-0 rounded-full" style={{ background: providerDot(m.id) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] leading-tight font-medium">{m.name ?? m.id}</span>
                  <span className="block truncate text-[10px] text-faint">{m.id}</span>
                </span>
                {used && <span className="shrink-0 text-[10px] text-faint">added</span>}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
