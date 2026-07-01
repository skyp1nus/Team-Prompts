"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePostApiPrompts } from "@/api/endpoints/prompts/prompts";
import { PromptKind } from "@/api/model";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { invalidatePath } from "@/lib/query/invalidate";
import { useWorkspace } from "@/lib/workspace/workspace-context";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  content: z.string().trim().min(1, "Prompt instructions are required"),
  useKeywords: z.boolean(),
  // The "Summary tag": run this prompt against the project's Summary script instead of the Original.
  useSummarySource: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function CreatePromptDialog() {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const create = usePostApiPrompts();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      content: "",
      useKeywords: false,
      useSummarySource: false,
    },
  });

  const onSubmit = (values: FormValues) =>
    create.mutate(
      {
        data: {
          workspaceId: activeWorkspaceId,
          name: values.name,
          content: values.content,
          kind: PromptKind.MainScripts,
          useKeywords: values.useKeywords,
          useSummarySource: values.useSummarySource,
        },
      },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/prompts");
          toast.success("Prompt created");
          setOpen(false);
          form.reset();
        },
        onError: () => toast.error("Could not create prompt"),
      },
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) form.reset();
      }}
    >
      <SheetTrigger
        render={
          <button
            className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="New prompt"
            aria-label="New prompt"
          />
        }
      >
        <Plus className="size-[15px]" />
      </SheetTrigger>

      <SheetContent className="w-full gap-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>New prompt</SheetTitle>
          <SheetDescription>Creates v1, set as Main automatically.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prompt name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Shorts Hook Titles" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="useSummarySource"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start justify-between gap-3 rounded-lg border border-border p-3.5">
                    <div className="min-w-0 space-y-0.5">
                      <FormLabel>Summary tag</FormLabel>
                      <p className="text-[11px] leading-relaxed text-faint">
                        Run this prompt against the project&apos;s Summary script instead of the Original.
                        Its results land in the separate Summary branch on the map — runnable once the
                        Summary is ready.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(c) => field.onChange(c === true)}
                        className="mt-0.5 shrink-0"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prompt instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe how titles or descriptions should be written…"
                        className="min-h-[220px] leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="useKeywords"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start justify-between gap-3 rounded-lg border border-border p-3.5">
                    <div className="min-w-0 space-y-0.5">
                      <FormLabel>Use project keywords</FormLabel>
                      <p className="text-[11px] leading-relaxed text-faint">
                        Injects the active project&apos;s keyword list into every run with this prompt. Add{" "}
                        <code className="rounded bg-muted px-1 py-px font-mono text-[10px]">{"{{keywords}}"}</code> in
                        the instructions to control placement, or it&apos;s appended automatically.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(c) => field.onChange(c === true)}
                        className="mt-0.5 shrink-0"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <SheetFooter className="flex-row justify-end border-t border-border">
              <SheetClose render={<Button type="button" variant="ghost" />}>Cancel</SheetClose>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create prompt"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
