"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardType, Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createProjectFromUpload } from "@/lib/api/uploads";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = [".pdf", ".txt"];

/** Strip the extension from a file name → the editable default project name (e.g. `my-script.pdf` → `my-script`). */
function nameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

const schema = z
  .object({
    // Which source the user is providing — drives validation below.
    tab: z.enum(["file", "text"]),
    file: z
      .instanceof(File, { message: "Choose a PDF or TXT file" })
      .refine((f) => ACCEPT.includes(f.name.slice(f.name.lastIndexOf(".")).toLowerCase()), {
        message: "Only .pdf and .txt files are supported",
      })
      .refine((f) => f.size <= MAX_BYTES, { message: "File is too large (max 20 MB)" })
      .optional(),
    text: z
      .string()
      // Bound pasted text by the SAME byte budget the file tab enforces (UTF-8 bytes, not chars —
      // multibyte Cyrillic would otherwise sail past the cap and hit the API's 25 MB limit as an
      // opaque 413). new Blob(...).size is the exact byte length the upload will send.
      .refine((t) => new Blob([t]).size <= MAX_BYTES, { message: "Text is too large (max 20 MB)" })
      .optional(),
    name: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tab === "file" && !(v.file instanceof File)) {
      ctx.addIssue({ code: "custom", path: ["file"], message: "Choose a PDF or TXT file" });
    }
    if (v.tab === "text" && (v.text ?? "").trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["text"], message: "Paste some text" });
    }
  });
type FormValues = z.infer<typeof schema>;

export function UploadDialog() {
  const qc = useQueryClient();
  const { activeWorkspaceId, setActiveScriptId, setProjectExpanded, selectBatchScript, applyRunSetup } =
    useWorkspace();
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaults: FormValues = { tab: "file", name: "", text: "" };
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const tab = useWatch({ control: form.control, name: "tab" });

  const onSubmit = async (values: FormValues) => {
    try {
      const name = values.name?.trim();
      // Build the source File: an uploaded file, or pasted text wrapped as a .txt blob. The backend
      // reads .txt via StreamReader into Script.ExtractedText — the same pipeline as a PDF upload.
      let file: File;
      if (values.tab === "text") {
        const fileName = `${name || "Pasted text"}.txt`;
        file = new File([values.text ?? ""], fileName, { type: "text/plain" });
      } else {
        if (!(values.file instanceof File)) return;
        file = values.file;
      }

      const project = await createProjectFromUpload(file, activeWorkspaceId, name || undefined);
      await invalidatePath(qc, "/api/script-projects", "/api/scripts");
      // Open the fresh project and select its source script so the center map switches to it.
      setProjectExpanded(project.id, true);
      if (project.originalScriptId) {
        setActiveScriptId(project.originalScriptId);
        // Default the new source to "use as context" (checked) so generation isn't blocked.
        selectBatchScript(project.originalScriptId);
        // Inherit the previous scenario's prompt+model selection so the new script is run-ready (#12).
        applyRunSetup();
      }
      toast.success("Project created");
      setOpen(false);
      form.reset(defaults);
    } catch {
      toast.error(values.tab === "text" ? "Could not create project" : "Upload failed");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) form.reset(defaults);
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="h-9 w-full justify-center gap-2" />}>
        <Plus className="size-4" /> New project
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Upload a PDF/TXT or paste text. It becomes the project&apos;s source script — generate
            вижимки / variants inside it.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="tab"
              render={({ field }) => (
                <Tabs value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="file">
                      <Upload /> Upload file
                    </TabsTrigger>
                    <TabsTrigger value="text">
                      <ClipboardType /> Paste text
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="file" className="mt-3">
                    <FormField
                      control={form.control}
                      name="file"
                      render={({ field: fileField }) => (
                        <FormItem>
                          <FormControl>
                            <button
                              type="button"
                              onClick={() => inputRef.current?.click()}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setHot(true);
                              }}
                              onDragLeave={() => setHot(false)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setHot(false);
                                const f = e.dataTransfer.files?.[0];
                                if (f) {
                                  fileField.onChange(f);
                                  fillNameFrom(f);
                                }
                              }}
                              className={cn(
                                "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-6 text-sm text-muted-foreground transition-colors hover:bg-accent",
                                hot && "border-primary bg-primary/[0.07]",
                              )}
                            >
                              <Upload className="size-5 text-faint" />
                              {fileField.value instanceof File ? (
                                <span className="font-medium text-foreground">{fileField.value.name}</span>
                              ) : (
                                "Click or drop a .pdf / .txt file"
                              )}
                              <input
                                ref={inputRef}
                                type="file"
                                accept=".pdf,.txt"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    fileField.onChange(f);
                                    fillNameFrom(f);
                                  }
                                }}
                              />
                            </button>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="text" className="mt-3">
                    <FormField
                      control={form.control}
                      name="text"
                      render={({ field: textField }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              placeholder="Paste your script or any plain text here…"
                              className="min-h-40 resize-y"
                              value={textField.value ?? ""}
                              onChange={textField.onChange}
                              onBlur={textField.onBlur}
                              name={textField.name}
                              ref={textField.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                </Tabs>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={tab === "text" ? "Defaults to “Pasted text”" : "Defaults to the file name"}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );

  /** Pre-fill the visible, editable name from a chosen file — but never clobber a name the user typed. */
  function fillNameFrom(f: File) {
    if (!form.getValues("name")?.trim()) {
      form.setValue("name", nameFromFile(f.name), { shouldValidate: false, shouldDirty: true });
    }
  }
}
