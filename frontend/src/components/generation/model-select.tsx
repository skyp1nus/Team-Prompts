"use client";

import { useGetApiSettingsModels } from "@/api/endpoints/settings/settings";
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
  const { data: models } = useGetApiSettingsModels();

  return (
    <Select
      value={value ?? (includeDefault ? DEFAULT : undefined)}
      onValueChange={(v) => onChange(v === DEFAULT ? null : v)}
    >
      <SelectTrigger className={className ?? "h-8 w-[190px]"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeDefault && <SelectItem value={DEFAULT}>Default model</SelectItem>}
        {(models ?? []).map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name ?? m.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
