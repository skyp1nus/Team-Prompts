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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  kind: z.enum([PromptKind.Metadata, PromptKind.ScriptTransform]),
  content: z.string().trim().min(1, "Prompt instructions are required"),
});
type FormValues = z.infer<typeof schema>;

export function CreatePromptDialog() {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const create = usePostApiPrompts();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", kind: PromptKind.Metadata, content: "" },
  });

  const onSubmit = (values: FormValues) =>
    create.mutate(
      {
        data: {
          workspaceId: activeWorkspaceId,
          name: values.name,
          content: values.content,
          kind: values.kind,
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
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <ToggleGroup
                        value={[field.value]}
                        onValueChange={(v) => {
                          const next = (v as string[])[v.length - 1];
                          if (next) field.onChange(next);
                        }}
                        variant="outline"
                        spacing={0}
                        className="w-full"
                      >
                        <ToggleGroupItem value={PromptKind.Metadata} className="flex-1">
                          Metadata
                        </ToggleGroupItem>
                        <ToggleGroupItem value={PromptKind.ScriptTransform} className="flex-1">
                          Transform
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </FormControl>
                    <p className="text-[11px] text-faint">
                      {field.value === PromptKind.ScriptTransform
                        ? "Rewrites a script into a new alternative (summary, rewrite, tone shift)."
                        : "Generates YouTube metadata — titles, descriptions, hooks, tags."}
                    </p>
                    <FormMessage />
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
