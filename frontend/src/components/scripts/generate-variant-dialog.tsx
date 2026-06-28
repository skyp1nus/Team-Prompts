"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useGetApiPrompts } from "@/api/endpoints/prompts/prompts";
import { usePostApiScriptProjectsIdVariants } from "@/api/endpoints/script-projects/script-projects";
import { PromptKind } from "@/api/model";
import { ModelSelect } from "@/components/generation/model-select";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidatePath } from "@/lib/query/invalidate";
import { useWorkspace } from "@/lib/workspace/workspace-context";

/**
 * Generate a new alternative script inside a project. The prompt list is scoped to Summary prompts —
 * distinct from the Main Scripts prompts used by the center generation flow.
 */
export function GenerateVariantDialog({
  projectId,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  projectId: string;
  /** Omit when the dialog is controlled via `open`/`onOpenChange` (e.g. opened from a menu item). */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { activeWorkspaceId, setActiveScriptId, setProjectExpanded } = useWorkspace();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (o: boolean) => {
    setOpenInternal(o);
    onOpenChange?.(o);
  };
  const [promptId, setPromptId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [name, setName] = useState("");

  const { data: prompts } = useGetApiPrompts(
    { workspaceId: activeWorkspaceId, kind: PromptKind.Summary },
    { query: { enabled: open && !!activeWorkspaceId } },
  );
  const gen = usePostApiScriptProjectsIdVariants();

  const reset = () => {
    setPromptId(null);
    setModel(null);
    setName("");
  };

  const onGenerate = () => {
    if (!promptId) return;
    gen.mutate(
      { id: projectId, data: { promptId, model: model ?? undefined, name: name.trim() || undefined } },
      {
        onSuccess: async (variant) => {
          await invalidatePath(qc, "/api/script-projects");
          setProjectExpanded(projectId, true);
          if (variant?.id) setActiveScriptId(variant.id);
          toast.success("Generating…");
          setOpen(false);
          reset();
        },
        onError: () => toast.error("Could not start generation"),
      },
    );
  };

  const hasPrompts = (prompts?.length ?? 0) > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New alternative</DialogTitle>
          <DialogDescription>
            Rewrite the source script with a Summary prompt — a short вижимка, a rewrite, a tone
            shift. Runs in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Summary prompt</Label>
            {hasPrompts ? (
              <Select value={promptId ?? undefined} onValueChange={(v) => setPromptId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a Summary prompt" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {prompts?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center text-[12px] leading-relaxed text-faint">
                No Summary prompts yet. Create one in the Prompt Library and set its type to
                “Summary”.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <ModelSelect value={model} onChange={setModel} className="h-9 w-full" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Name (optional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to the prompt name"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onGenerate} disabled={!promptId || gen.isPending}>
            {gen.isPending ? "Starting…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
