"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, KeyRound, RefreshCw, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  useDeleteApiSettingsApiKey,
  useGetApiSettings,
  usePostApiSettingsModelsRefresh,
  usePutApiSettingsApiKey,
  usePutApiSettingsFavoriteModels,
} from "@/api/endpoints/settings/settings";
import type { SettingsDto } from "@/api/model";
import { useAccent } from "@/components/accent-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth/auth-context";
import { invalidatePath } from "@/lib/query/invalidate";
import { ACCENT_KEYS, ACCENTS } from "@/lib/theme/accents";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { isPrivileged } = useAuth();
  const { data: settings } = useGetApiSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-y-auto p-7">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/" />} variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-[22px] font-[650] tracking-tight">Settings</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            {isPrivileged
              ? "Route every generation through one shared OpenRouter key."
              : "Personalise how Team Prompts looks for you."}
          </p>
        </div>
      </div>

      {isPrivileged && (
        <>
          <ApiKeyCard settings={settings} />
          <FavoriteModelsCard settings={settings} />
        </>
      )}

      <AppearanceCard />
    </div>
  );
}

/* ---------------- API key (write-only, delete-before-replace) ---------------- */
const keySchema = z.object({ apiKey: z.string().trim().min(1, "Enter a key") });
type KeyValues = z.infer<typeof keySchema>;

function ApiKeyCard({ settings }: { settings?: SettingsDto }) {
  const qc = useQueryClient();
  const setKey = usePutApiSettingsApiKey();
  const removeKey = useDeleteApiSettingsApiKey();
  const form = useForm<KeyValues>({ resolver: zodResolver(keySchema), defaultValues: { apiKey: "" } });
  const isSet = settings?.isApiKeySet ?? false;

  const onSubmit = (values: KeyValues) =>
    setKey.mutate(
      { data: { apiKey: values.apiKey } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/settings");
          form.reset({ apiKey: "" });
          toast.success("API key saved");
        },
        onError: () => toast.error("Could not save key (one may already be set)"),
      },
    );

  const onRemove = () =>
    removeKey.mutate(undefined, {
      onSuccess: async () => {
        await invalidatePath(qc, "/api/settings");
        toast.success("API key removed");
      },
      onError: () => toast.error("Could not remove key"),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">OpenRouter connection</CardTitle>
        <CardDescription>
          All providers are billed through one OpenRouter account. The key is write-only — remove the
          current one before setting a different key.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          Status:
          {isSet ? (
            <Badge className="gap-1 bg-ok/15 text-ok">
              <Check className="size-3" /> Key is set
            </Badge>
          ) : (
            <Badge variant="destructive">No key set</Badge>
          )}
        </div>

        {isSet ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <p className="mb-1.5 text-sm font-medium">OpenRouter API key</p>
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-muted-foreground">
                <KeyRound className="size-3.5 shrink-0" />
                <span className="truncate font-mono text-[13px] tracking-wider">sk-or-v1-••••••••••••••••••••</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onRemove}
              disabled={removeKey.isPending}
              className="h-9 gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-end gap-2">
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>OpenRouter API key</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="sk-or-v1-…" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={setKey.isPending} className="h-9">
                Save
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Favorite models (multi-select + free toggle) ---------------- */
function FavoriteModelsCard({ settings }: { settings?: SettingsDto }) {
  const qc = useQueryClient();
  const save = usePutApiSettingsFavoriteModels();
  const refresh = usePostApiSettingsModelsRefresh();
  const models = useMemo(() => settings?.availableModels ?? [], [settings?.availableModels]);

  const [selected, setSelected] = useState<string[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);

  // Sync the selection from the server once settings load / change.
  useEffect(() => {
    if (settings?.favoriteModels) setSelected(settings.favoriteModels);
  }, [settings?.favoriteModels]);

  const visible = freeOnly ? models.filter((m) => m.isFree) : models;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => (on ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)));

  const onSave = () =>
    save.mutate(
      { data: { models: selected } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/settings", "/api/settings/models");
          toast.success("Favorite models saved");
        },
        onError: () => toast.error("Could not save favorites"),
      },
    );

  const onRefresh = () =>
    refresh.mutate(undefined, {
      onSuccess: async () => {
        await invalidatePath(qc, "/api/settings", "/api/settings/models");
        toast.success("Model list refreshed");
      },
      onError: () => toast.error("Refresh failed — is the API key set?"),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Favorite models</CardTitle>
        <CardDescription>
          The team&apos;s go-to models — shown in the picker next to Generate. The first one is the default.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
            <Switch checked={freeOnly} onCheckedChange={(c) => setFreeOnly(c === true)} />
            Show free models only
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refresh.isPending}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={cn("size-4", refresh.isPending && "animate-spin")} /> Refresh
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-faint">
              {models.length === 0 ? "No models yet — hit Refresh." : "No free models in the list."}
            </p>
          ) : (
            visible.map((m) => {
              const on = selected.includes(m.id);
              const isDefault = selected[0] === m.id;
              return (
                <label
                  key={m.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-accent",
                    on && "bg-primary/[0.05]",
                  )}
                >
                  <Checkbox checked={on} onCheckedChange={(c) => toggle(m.id, c === true)} />
                  <span className="min-w-0 flex-1 truncate">{m.name ?? m.id}</span>
                  {isDefault && (
                    <Badge variant="secondary" className="gap-1 text-[10.5px]">
                      <Star className="size-2.5 fill-current" /> default
                    </Badge>
                  )}
                  {m.isFree && (
                    <Badge className="bg-ok/15 text-[10.5px] text-ok">free</Badge>
                  )}
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-faint">
            {selected.length} selected · {models.length} available
          </p>
          <Button type="button" onClick={onSave} disabled={save.isPending} className="h-9">
            Save favorites
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Appearance (everyone) ---------------- */
function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Personal to you — saved on this device.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="text-sm">Theme</span>
          <ThemeToggle />
        </div>
        <div>
          <p className="mb-2.5 text-sm font-medium">Accent colour</p>
          <AccentSwatches />
        </div>
      </CardContent>
    </Card>
  );
}

function AccentSwatches() {
  const { accent, setAccent } = useAccent();
  return (
    <div className="flex flex-wrap gap-2.5">
      {ACCENT_KEYS.map((k) => {
        const on = accent === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => setAccent(k)}
            title={ACCENTS[k].name}
            aria-label={ACCENTS[k].name}
            aria-pressed={on}
            style={{ background: ACCENTS[k].light.a }}
            className={cn(
              "size-7 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] transition-transform hover:scale-110",
              on && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
            )}
          />
        );
      })}
    </div>
  );
}
