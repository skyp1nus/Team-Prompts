"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  usePostApiWorkspaces,
  usePutApiWorkspacesId,
} from "@/api/endpoints/workspaces/workspaces";
import type { WorkspaceDto } from "@/api/model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { uploadWorkspaceAvatar } from "@/lib/api/uploads";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";

type DialogState = { mode: "create" } | { mode: "edit"; workspace: WorkspaceDto } | null;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const MAX_BYTES = 8 * 1024 * 1024;

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  key: z.string().trim().max(10, "Max 10 characters").optional(),
});
type FormValues = z.infer<typeof schema>;

export function WorkspaceDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* Keyed so each open mounts fresh with the right defaults — no reset effect needed. */}
        {state && (
          <WorkspaceForm
            key={state.mode === "edit" ? state.workspace.id : "create"}
            editing={state.mode === "edit" ? state.workspace : null}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceForm({ editing, onClose }: { editing: WorkspaceDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const create = usePostApiWorkspaces();
  const update = usePutApiWorkspacesId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: editing?.name ?? "", key: editing?.key ?? "" },
  });

  // Cleanup-only effect (no setState in body): revoke the previous object URL when it changes/unmounts.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Avatar must be an image");
    if (f.size > MAX_BYTES) return toast.error("Image too large (max 8 MB)");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const currentAvatar = preview ?? (editing?.avatarUrl ? `${API_BASE}${editing.avatarUrl}` : null);
  const busy = create.isPending || update.isPending;

  const onSubmit = async (values: FormValues) => {
    const data = { name: values.name, key: values.key?.trim() || null };
    try {
      const ws = editing
        ? await update.mutateAsync({ id: editing.id, data })
        : await create.mutateAsync({ data });

      if (file && ws?.id) await uploadWorkspaceAvatar(ws.id, file);

      await invalidatePath(qc, "/api/workspaces");
      toast.success(editing ? "Space updated" : "Space created");
      onClose();
    } catch {
      toast.error(editing ? "Update failed" : "Could not create space");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit space" : "New space"}</DialogTitle>
        <DialogDescription>A space scopes its own scripts and prompt library.</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong text-faint transition-colors hover:border-primary hover:text-primary",
                currentAvatar && "border-solid border-border",
              )}
              title="Upload avatar"
            >
              {currentAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentAvatar} alt="avatar" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-5" />
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </button>

            <div className="flex flex-1 flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Tech Channel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short key (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. TT" maxLength={10} {...field} />
                    </FormControl>
                    <FormDescription>Shown on the dock when there is no avatar.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save" : "Create space"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
