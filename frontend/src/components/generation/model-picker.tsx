"use client";

import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useGetApiSettingsModels } from "@/api/endpoints/settings/settings";
import type { ModelDto } from "@/api/model";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { providerDot, providerOf } from "@/lib/models";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export function ModelPicker() {
  const { data: models } = useGetApiSettingsModels();
  const { runModels, toggleRunModel, setRunModels } = useWorkspace();
  const list = models ?? [];

  const grouped = list.reduce<Record<string, ModelDto[]>>((acc, m) => {
    const p = providerOf(m.id);
    (acc[p] ??= []).push(m);
    return acc;
  }, {});

  const allOn = list.length > 0 && runModels.length === list.length;
  const count = runModels.length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-[12.5px] font-medium whitespace-nowrap transition-colors hover:bg-accent",
              count === 0 ? "border-warn text-warn" : "border-input text-foreground",
            )}
            title="Choose AI models"
          />
        }
      >
        <Sparkles className="size-3.5 text-primary" />
        <b className="font-bold tabular-nums">{count}</b> {count === 1 ? "model" : "models"}
        <ChevronDown className="size-3 text-faint" />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[62vh] w-[316px] gap-0 overflow-y-auto p-1.5">
        <div className="mb-1 flex items-center justify-between border-b border-border px-2 pt-1 pb-2.5">
          <span className="text-[12.5px] font-semibold">Generate with each of these</span>
          <button
            onClick={() => setRunModels(allOn ? [] : list.map((m) => m.id))}
            className="rounded-md px-1.5 py-1 text-[11.5px] font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            {allOn ? "Clear" : "Select all"}
          </button>
        </div>
        {list.length === 0 && (
          <p className="px-2 py-4 text-center text-[12px] text-faint">
            No models. Set the OpenRouter key in Settings.
          </p>
        )}
        {Object.entries(grouped).map(([provider, items]) => (
          <div key={provider}>
            <div className="eyebrow !text-[10px] px-2.5 pt-2.5 pb-1">{provider}</div>
            {items.map((m) => {
              const on = runModels.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleRunModel(m.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] text-[11px]",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="size-[7px] shrink-0 rounded-full" style={{ background: providerDot(m.id) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-tight font-medium">{m.name ?? m.id}</span>
                    <span className="block truncate text-[10.5px] text-faint">{m.id}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
