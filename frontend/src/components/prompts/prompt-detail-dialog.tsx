"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GitBranch } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { toast } from "sonner";
import { z } from "zod";
import {
  useGetApiPromptsId,
  usePostApiPromptsIdVersions,
  usePostApiPromptsIdVersionsVersionIdPromote,
} from "@/api/endpoints/prompts/prompts";
import type { PromptVersionDto } from "@/api/model";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/format";
import { invalidatePath } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";

type Props = {
  promptId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const branchSchema = z.object({
  note: z.string().trim().max(160).optional(),
  content: z.string().trim().min(1, "Prompt instructions are required"),
});
type BranchValues = z.infer<typeof branchSchema>;

export function PromptDetailDialog({ promptId, open, onOpenChange }: Props) {
  const { data: prompt } = useGetApiPromptsId(promptId ?? "", {
    query: { enabled: !!promptId && open },
  });
  const versions = useMemo(() => prompt?.versions ?? [], [prompt]);

  const [branchOf, setBranchOf] = useState<string | null>(null);

  useEffect(() => {
    setBranchOf(null);
  }, [promptId, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-3xl">
        {!prompt ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : branchOf ? (
          <BranchPanel
            promptId={prompt.id}
            promptName={prompt.name}
            base={versions.find((v) => v.id === branchOf) ?? versions[versions.length - 1]}
            versions={versions}
            onBack={() => setBranchOf(null)}
          />
        ) : (
          <DetailPanel
            promptId={prompt.id}
            promptName={prompt.name}
            versions={versions}
            onBranch={(id) => setBranchOf(id)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function vLabel(versions: PromptVersionDto[], id: string | null | undefined) {
  const idx = versions.findIndex((v) => v.id === id);
  if (idx < 0) return "—";
  const v = versions[idx];
  return `v${idx + 1}${v.isMain ? " · Main" : ""}`;
}

/* ---------------- detail ---------------- */
function DetailPanel({
  promptId,
  promptName,
  versions,
  onBranch,
}: {
  promptId: string;
  promptName: string;
  versions: PromptVersionDto[];
  onBranch: (versionId: string) => void;
}) {
  const qc = useQueryClient();
  const { resolvedTheme } = useTheme();
  const promote = usePostApiPromptsIdVersionsVersionIdPromote();

  const main = versions.find((v) => v.isMain) ?? versions[versions.length - 1];
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);

  useEffect(() => {
    if (!main) return;
    setToId((cur) => cur ?? main.id);
    setFromId((cur) => cur ?? (versions.find((v) => v.id !== main.id) ?? main).id);
  }, [versions, main]);

  const fromV = versions.find((v) => v.id === fromId);
  const toV = versions.find((v) => v.id === toId);

  const doPromote = (versionId: string) =>
    promote.mutate(
      { id: promptId, versionId },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/prompts");
          toast.success("Promoted to Main");
        },
        onError: () => toast.error("Promote failed"),
      },
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-3 border-b border-border p-5 pr-12">
        <div className="flex-1">
          <div className="text-[17px] leading-tight font-[650]">{promptName}</div>
          <div className="mt-1 text-[12.5px] text-faint">
            {versions.length} saved version{versions.length === 1 ? "" : "s"}
            {main && <> · the team is using {vLabel(versions, main.id)}</>}
          </div>
        </div>
        {main && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onBranch(main.id)}>
            <GitBranch className="size-3.5" /> New draft from current
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        {/* main version */}
        {main && (
          <section>
            <SectionTitle>The version your team is using now</SectionTitle>
            <div className="rounded-[10px] border border-border border-l-[3px] border-l-primary bg-card p-4 text-[13px] leading-relaxed">
              <div className="mb-2 flex items-center gap-2">
                <Tag kind="main" />
                <span className="text-[11.5px] text-faint">
                  {vLabel(versions, main.id)} · by {main.author.displayName}
                </span>
              </div>
              {main.content}
            </div>
          </section>
        )}

        {/* version tree */}
        <section>
          <SectionTitle>
            All versions{" "}
            <span className="font-normal tracking-normal text-faint normal-case">— newest at the bottom</span>
          </SectionTitle>
          <div className="relative pl-2">
            {versions.map((v, idx) => {
              const isBranch = !!v.parentVersionId && !v.isMain;
              return (
                <div
                  key={v.id}
                  className={cn("relative pb-3.5", isBranch ? "pl-[54px]" : "pl-[30px]")}
                >
                  <span className="absolute top-0 bottom-0 left-[5px] w-0.5 bg-border" />
                  {isBranch && (
                    <span className="absolute top-[-6px] left-[5px] h-[22px] w-[34px] rounded-bl-[9px] border-b-2 border-l-2 border-border" />
                  )}
                  <span
                    className={cn(
                      "absolute top-1 z-[2] size-3 rounded-full border-2 bg-background",
                      isBranch ? "left-9 border-warn" : "left-0",
                      v.isMain ? "border-primary bg-primary" : "border-border-strong",
                    )}
                  />
                  <div className="rounded-[10px] border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold">v{idx + 1}</span>
                      {v.isMain ? <Tag kind="main" /> : isBranch ? <Tag kind="draft" /> : <Tag kind="old" />}
                    </div>
                    <div className="mt-1 text-[11.5px] text-faint">
                      {v.author.displayName} · {formatRelative(v.createdAt)}
                    </div>
                    {v.note && <div className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">{v.note}</div>}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {!v.isMain && (
                        <MiniBtn accent onClick={() => doPromote(v.id)} disabled={promote.isPending}>
                          Make this the team version
                        </MiniBtn>
                      )}
                      <MiniBtn
                        onClick={() => {
                          setFromId(v.isMain ? (versions.find((x) => x.id !== main?.id)?.id ?? v.id) : v.id);
                          setToId(main?.id ?? v.id);
                        }}
                      >
                        Compare with current
                      </MiniBtn>
                      <MiniBtn onClick={() => onBranch(v.id)}>Branch</MiniBtn>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* diff */}
        <section>
          <SectionTitle>See what changed between two versions</SectionTitle>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-[var(--diff-del-tx)] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                FROM
              </span>
              <Select value={fromId ?? undefined} onValueChange={setFromId}>
                <SelectTrigger size="sm" className="max-w-[260px]">
                  <SelectValue placeholder="From" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v, i) => (
                    <SelectItem key={v.id} value={v.id}>
                      {vLabel(versions, v.id) || `v${i + 1}`}
                      {v.note ? ` — ${v.note}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="size-4 text-faint" />
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-[var(--diff-add-tx)] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                TO
              </span>
              <Select value={toId ?? undefined} onValueChange={setToId}>
                <SelectTrigger size="sm" className="max-w-[260px]">
                  <SelectValue placeholder="To" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v, i) => (
                    <SelectItem key={v.id} value={v.id}>
                      {vLabel(versions, v.id) || `v${i + 1}`}
                      {v.note ? ` — ${v.note}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-hidden rounded-[10px] border border-border bg-card text-[13px]">
            {fromV && toV ? (
              <ReactDiffViewer
                oldValue={fromV.content}
                newValue={toV.content}
                splitView={false}
                compareMethod={DiffMethod.WORDS}
                hideLineNumbers
                useDarkTheme={resolvedTheme === "dark"}
              />
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">Pick two versions to compare.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- branch ---------------- */
function BranchPanel({
  promptId,
  promptName,
  base,
  versions,
  onBack,
}: {
  promptId: string;
  promptName: string;
  base: PromptVersionDto | undefined;
  versions: PromptVersionDto[];
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const branch = usePostApiPromptsIdVersions();
  const form = useForm<BranchValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: { note: "", content: base?.content ?? "" },
  });

  const onSubmit = (values: BranchValues) => {
    if (!base) return;
    branch.mutate(
      { id: promptId, data: { parentVersionId: base.id, content: values.content, note: values.note?.trim() || null } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/prompts");
          toast.success("Draft saved as a new version");
          onBack();
        },
        onError: () => toast.error("Branch failed"),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-5 pr-12">
        <div className="text-[17px] leading-tight font-[650]">Write a new draft</div>
        <div className="mt-1 text-[12.5px] text-faint">
          Of “{promptName}” · starts from {vLabel(versions, base?.id)}. Saved as a new version for the team to review.
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    What are you changing? <span className="font-normal text-faint">(short note)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Shorter titles, stronger hook" {...field} />
                  </FormControl>
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
                    <Textarea className="min-h-[260px] leading-relaxed" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex shrink-0 justify-end gap-2.5 border-t border-border p-4">
            <Button type="button" variant="ghost" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={branch.isPending}>
              {branch.isPending ? "Saving…" : "Save as new version"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

/* ---------------- bits ---------------- */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-faint uppercase">{children}</h3>
  );
}

function Tag({ kind }: { kind: "main" | "draft" | "old" }) {
  if (kind === "main")
    return (
      <span className="rounded-[5px] bg-primary/[0.08] px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-primary">
        IN USE BY TEAM
      </span>
    );
  if (kind === "draft")
    return (
      <span className="rounded-[5px] bg-warn/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-warn">
        DRAFT
      </span>
    );
  return (
    <span className="rounded-[5px] bg-accent px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-faint">
      EARLIER
    </span>
  );
}

function MiniBtn({
  children,
  onClick,
  accent,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
        accent
          ? "border-primary/20 text-primary hover:bg-primary/10"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
