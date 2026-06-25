"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
import { uploadScript } from "@/lib/api/uploads";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = [".pdf", ".txt"];

const schema = z.object({
  file: z
    .instanceof(File, { message: "Choose a PDF or TXT file" })
    .refine((f) => ACCEPT.includes(f.name.slice(f.name.lastIndexOf(".")).toLowerCase()), {
      message: "Only .pdf and .txt files are supported",
    })
    .refine((f) => f.size <= MAX_BYTES, { message: "File is too large (max 20 MB)" }),
  name: z.string().trim().max(200).optional(),
});
type FormValues = z.infer<typeof schema>;

export function UploadDialog() {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await uploadScript(values.file, activeWorkspaceId, values.name?.trim() || undefined);
      await invalidatePath(qc, "/api/scripts");
      toast.success("Script uploaded");
      setOpen(false);
      form.reset({ name: "" });
    } catch {
      toast.error("Upload failed");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) form.reset({ name: "" });
      }}
    >
      <DialogTrigger
        render={
          <button className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-transparent px-3 py-4 text-muted-foreground transition-colors hover:border-primary hover:text-foreground" />
        }
      >
        <Upload className="size-4 text-faint" />
        <span className="text-[12px] font-medium text-muted-foreground">Drop PDF or TXT</span>
        <span className="text-[10.5px] text-faint">or click to upload</span>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload script</DialogTitle>
          <DialogDescription>PDF or TXT. The text is extracted and stored.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="file"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>File</FormLabel>
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
                        if (f) field.onChange(f);
                      }}
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-6 text-sm text-muted-foreground transition-colors hover:bg-accent",
                        hot && "border-primary bg-primary/[0.07]",
                      )}
                    >
                      <Upload className="size-5 text-faint" />
                      {field.value instanceof File ? (
                        <span className="font-medium text-foreground">{field.value.name}</span>
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
                          if (f) field.onChange(f);
                        }}
                      />
                    </button>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Defaults to the file name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Uploading…" : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
