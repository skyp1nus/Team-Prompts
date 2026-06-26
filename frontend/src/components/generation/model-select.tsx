"use client";

import { useGetApiSettings } from "@/api/endpoints/settings/settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT = "__default__";

export function ModelSelect({
  value,
  onChange,
  includeDefault = true,
  className,
  placeholder = "Model",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  includeDefault?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const { data: settings } = useGetApiSettings();
  const all = settings?.availableModels ?? [];
  const favIds = settings?.favoriteModels ?? [];
  // Only the team's favorite models here — keeps the dropdown short instead of listing all 300+.
  const models = favIds.length > 0 ? all.filter((m) => favIds.includes(m.id)) : all;

  // value→label map so the trigger shows the model name (not the raw value) without mounting all items.
  const items = [
    ...(includeDefault ? [{ label: "Default model", value: DEFAULT }] : []),
    ...models.map((m) => ({ label: m.name ?? m.id, value: m.id })),
  ];

  return (
    <Select
      items={items}
      value={value ?? (includeDefault ? DEFAULT : undefined)}
      onValueChange={(v) => onChange(v === DEFAULT ? null : v)}
    >
      <SelectTrigger className={className ?? "h-8 w-[190px]"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[280px] w-[240px]">
        {includeDefault && <SelectItem value={DEFAULT}>Default model</SelectItem>}
        {models.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name ?? m.id}
          </SelectItem>
        ))}
        {models.length === 0 && (
          <div className="px-2 py-3 text-center text-[12px] text-faint">
            No favorite models — set them in Settings.
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
