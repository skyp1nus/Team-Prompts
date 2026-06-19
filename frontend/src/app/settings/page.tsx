"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  useGetApiSettings,
  usePostApiSettingsModelsRefresh,
  usePutApiSettingsApiKey,
  usePutApiSettingsDefaultModel,
} from "@/api/endpoints/settings/settings";
import { usePostApiUsers } from "@/api/endpoints/users/users";
import type { SettingsDto } from "@/api/model";
import { useAccent } from "@/components/accent-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { invalidatePath } from "@/lib/query/invalidate";
import { ACCENT_KEYS, ACCENTS } from "@/lib/theme/accents";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { isAdmin } = useAuth();
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
            Route every generation through one shared OpenRouter key.
          </p>
        </div>
        {!isAdmin && (
          <Badge variant="secondary" className="ml-auto">
            read-only (member)
          </Badge>
        )}
      </div>

      <ApiKeyCard settings={settings} isAdmin={isAdmin} />
      <DefaultModelCard settings={settings} isAdmin={isAdmin} />
      {isAdmin && <CreateUserCard />}

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
    </div>
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

/* ---------------- API key (write-only) ---------------- */
const keySchema = z.object({ apiKey: z.string().trim().min(1, "Enter a key") });
type KeyValues = z.infer<typeof keySchema>;

function ApiKeyCard({ settings, isAdmin }: { settings?: SettingsDto; isAdmin: boolean }) {
  const qc = useQueryClient();
  const setKey = usePutApiSettingsApiKey();
  const form = useForm<KeyValues>({ resolver: zodResolver(keySchema), defaultValues: { apiKey: "" } });

  const onSubmit = (values: KeyValues) =>
    setKey.mutate(
      { data: { apiKey: values.apiKey } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/settings");
          form.reset({ apiKey: "" });
          toast.success("API key saved");
        },
        onError: () => toast.error("Could not save key"),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">OpenRouter connection</CardTitle>
        <CardDescription>
          All providers are billed through a single OpenRouter account. The key is write-only — never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          Status:
          {settings?.isApiKeySet ? (
            <Badge className="gap-1 bg-ok/15 text-ok">
              <Check className="size-3" /> Key is set
            </Badge>
          ) : (
            <Badge variant="destructive">No key set</Badge>
          )}
        </div>
        {isAdmin && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-start gap-2">
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>OpenRouter API key</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="sk-or-v1-…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={setKey.isPending} className="mt-[26px]">
                Save
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- default model ---------------- */
const modelSchema = z.object({ model: z.string().min(1, "Pick a model") });
type ModelValues = z.infer<typeof modelSchema>;

function DefaultModelCard({ settings, isAdmin }: { settings?: SettingsDto; isAdmin: boolean }) {
  const qc = useQueryClient();
  const setModel = usePutApiSettingsDefaultModel();
  const refresh = usePostApiSettingsModelsRefresh();
  const models = settings?.availableModels ?? [];

  const form = useForm<ModelValues>({ resolver: zodResolver(modelSchema), defaultValues: { model: "" } });

  useEffect(() => {
    if (settings?.defaultModel) form.reset({ model: settings.defaultModel });
  }, [settings?.defaultModel, form]);

  const onSubmit = (values: ModelValues) =>
    setModel.mutate(
      { data: { model: values.model } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/settings");
          toast.success("Default model saved");
        },
        onError: () => toast.error("Could not save default model"),
      },
    );

  const doRefresh = () =>
    refresh.mutate(undefined, {
      onSuccess: async () => {
        await invalidatePath(qc, "/api/settings");
        toast.success("Model list refreshed");
      },
      onError: () => toast.error("Refresh failed — is the API key set?"),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Default model</CardTitle>
        <CardDescription>
          Pre-selected in the model picker next to Generate, where you can run several models per generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-start gap-2">
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!isAdmin}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={settings?.defaultModel ?? "Select a model"} />
                      </SelectTrigger>
                      <SelectContent>
                        {settings?.defaultModel && !models.some((m) => m.id === settings.defaultModel) && (
                          <SelectItem value={settings.defaultModel}>{settings.defaultModel}</SelectItem>
                        )}
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name ?? m.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isAdmin && (
              <>
                <Button type="button" variant="outline" onClick={doRefresh} disabled={refresh.isPending} className="mt-[26px] gap-1.5">
                  <RefreshCw className={refresh.isPending ? "size-4 animate-spin" : "size-4"} /> Refresh
                </Button>
                <Button type="submit" disabled={setModel.isPending} className="mt-[26px]">
                  Save
                </Button>
              </>
            )}
          </form>
        </Form>
        <p className="text-xs text-faint">{models.length} models available</p>
      </CardContent>
    </Card>
  );
}

/* ---------------- create user (admin) ---------------- */
const userSchema = z.object({
  email: z.string().email("Enter a valid email"),
  displayName: z.string().trim().min(1, "Display name is required"),
  password: z.string().min(6, "At least 6 characters"),
  role: z.enum(["Member", "Admin"]),
});
type UserValues = z.infer<typeof userSchema>;

function CreateUserCard() {
  const create = usePostApiUsers();
  const form = useForm<UserValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { email: "", displayName: "", password: "", role: "Member" },
  });

  const onSubmit = (values: UserValues) =>
    create.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast.success("User created");
          form.reset({ email: "", displayName: "", password: "", role: "Member" });
        },
        onError: () => toast.error("Could not create user (check email/password)"),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create user</CardTitle>
        <CardDescription>Admin-only. Accounts are created directly (no email invite).</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Member">Member</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>
                Create user
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
