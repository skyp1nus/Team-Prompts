"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, GitBranch, Pencil, TriangleAlert, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { toast } from "sonner";
import { z } from "zod";
import {
  useGetApiPromptsId,
  usePostApiPromptsIdVersions,
  usePostApiPromptsIdVersionsVersionIdPromote,
  usePutApiPromptsId,
} from "@/api/endpoints/prompts/prompts";
import { PromptKind, type PromptVersionDto } from "@/api/model";
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
import { useWorkspace } from "@/lib/workspace/workspace-context";

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
  // Reset the branch selection when the dialog switches prompts or is reopened — tracked across
  // renders rather than in an effect, so it applies in the same paint.
  const detailKey = `${promptId}:${open}`;
  const [syncedKey, setSyncedKey] = useState(detailKey);
  if (detailKey !== syncedKey) {
    setSyncedKey(detailKey);
    setBranchOf(null);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:w-[56vw] data-[side=right]:sm:max-w-4xl">
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
            kind={prompt.kind}
            useSummarySource={prompt.useSummarySource}
            useKeywords={prompt.useKeywords}
            versions={versions}
            onBranch={(id) => setBranchOf(id)}
            onPicked={() => onOpenChange(false)}
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
  kind,
  useSummarySource,
  useKeywords,
  versions,
  onBranch,
  onPicked,
}: {
  promptId: string;
  promptName: string;
  kind: PromptKind;
  useSummarySource: boolean;
  useKeywords: boolean;
  versions: PromptVersionDto[];
  onBranch: (versionId: string) => void;
  onPicked: () => void;
}) {
  const qc = useQueryClient();
  const { resolvedTheme } = useTheme();
  const promote = usePostApiPromptsIdVersionsVersionIdPromote();
  const updatePrompt = usePutApiPromptsId();
  const { selectedPromptIds, togglePrompt, promptVersions, setPromptVersion } = useWorkspace();

  // Toggle a library flag on this prompt. Name is required by the API, so echo the current one.
  const setFlag = (patch: { useSummarySource?: boolean }, msg: string) =>
    updatePrompt.mutate(
      { id: promptId, data: { name: promptName, ...patch } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/prompts");
          toast.success(msg);
        },
        onError: () => toast.error("Couldn’t update the prompt"),
      },
    );

  const main = versions.find((v) => v.isMain) ?? versions[versions.length - 1];
  // Which version the next run will use for this prompt: an explicit pin, else the current main.
  const activeVersionId = promptVersions[promptId]?.versionId ?? main?.id ?? null;
  // A Summary-KIND prompt is the mind-map builder: its output IS the Summary node, so it's never a manual
  // run — the "Use for generation" action is hidden (the backend would create no session for it).
  const isSummaryPrompt = kind === PromptKind.Summary;

  // The workspace-static "Unique" prompts (Summary master, Tags, Description) are seeded empty. Until the
  // team writes their instructions they can't run on the mind map — surface a prominent setup step. Hide
  // the Summary-tag settings for Tags/Description (they don't apply).
  const isStaticKind = kind === PromptKind.Tags || kind === PromptKind.Description;
  const needsSetup =
    (isStaticKind || kind === PromptKind.Summary) && (main?.content ?? "").trim() === "";

  // Pick a version for the next generation. Choosing main clears the pin so the run keeps following
  // whatever the team promotes; choosing any other version pins it. Also selects the prompt for the run.
  const applyForGeneration = (v: PromptVersionDto, idx: number) => {
    if (isSummaryPrompt) return; // builders never run as lanes — guard the (hidden) action defensively
    setPromptVersion(promptId, v.isMain ? null : { versionId: v.id, number: idx + 1 });
    if (!selectedPromptIds.includes(promptId)) togglePrompt(promptId);
    toast.success(v.isMain ? "The next run will follow Main" : `The next run will use v${idx + 1}`);
    onPicked();
  };
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);

  // Seed the compare selectors from Main once it's available (only while still unset), during render
  // instead of in an effect.
  if (main && toId === null) setToId(main.id);
  if (main && fromId === null) setFromId((versions.find((v) => v.id !== main.id) ?? main).id);

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
          <EditablePromptName promptId={promptId} promptName={promptName} useKeywords={useKeywords} />
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
        {/* Tags & Description: seeded empty — prominent one-shot setup that writes + promotes the content. */}
        {needsSetup && main && (
          <StaticPromptSetup promptId={promptId} baseVersionId={main.id} kind={kind} />
        )}

        {/* library flags — Summary tag (hidden for the static Tags/Description prompts) */}
        {!isStaticKind && (
          <section>
            <SectionTitle>Summary settings</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              <MiniBtn
                accent={useSummarySource}
                disabled={updatePrompt.isPending}
                onClick={() =>
                  setFlag(
                    { useSummarySource: !useSummarySource },
                    useSummarySource ? "Summary tag removed" : "Tagged — runs against the Summary",
                  )
                }
              >
                {useSummarySource ? "✓ Summary tag" : "Tag: run against Summary"}
              </MiniBtn>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              {kind === PromptKind.Summary
                ? "This is a Summary prompt — the workspace's top one auto-runs on each script's first generation to build its mind map (no setup). The Summary tag routes a prompt's runs to that Summary script."
                : "Tag this prompt to run it against the project's Summary script (the Summary branch) instead of the Original."}
            </p>
          </section>
        )}

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
                      {!isSummaryPrompt && (
                        <MiniBtn accent={activeVersionId === v.id} onClick={() => applyForGeneration(v, idx)}>
                          {activeVersionId === v.id ? "✓ Using for next run" : "Use for generation"}
                        </MiniBtn>
                      )}
                      {!v.isMain && (
                        <MiniBtn onClick={() => doPromote(v.id)} disabled={promote.isPending}>
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
                <SelectTrigger size="sm" className="w-[320px] max-w-full">
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
                <SelectTrigger size="sm" className="w-[320px] max-w-full">
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
          <div className="max-w-full overflow-x-auto rounded-[10px] border border-border bg-card text-[13px] [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
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

/* ---------------- static prompt first-time setup ---------------- */
/** One-shot "fill in the prompt" for the seeded, empty Tags/Description prompts: writes the content as a
 *  new version AND promotes it to Main in a single click, so the prompt becomes configured (and stops
 *  burning on the mind map) without the branch-then-promote two-step. */
function StaticPromptSetup({
  promptId,
  baseVersionId,
  kind,
}: {
  promptId: string;
  baseVersionId: string;
  kind: PromptKind;
}) {
  const qc = useQueryClient();
  const branch = usePostApiPromptsIdVersions();
  const promote = usePostApiPromptsIdVersionsVersionIdPromote();
  const [text, setText] = useState("");
  const pending = branch.isPending || promote.isPending;

  const placeholder =
    kind === PromptKind.Tags
      ? "e.g. Generate 5 alternative sets of YouTube tags — one comma-separated set per line, ordered by importance."
      : kind === PromptKind.Summary
        ? "e.g. Condense this script into a tight ~150-word summary (вижимка) that keeps the key beats and the hook."
        : "e.g. Write 5 alternative YouTube descriptions — one per line, with a hook, a summary and a soft CTA.";

  const save = async () => {
    const content = text.trim();
    if (!content || pending) return;
    try {
      const v = await branch.mutateAsync({
        id: promptId,
        data: { parentVersionId: baseVersionId, content, note: "Initial setup" },
      });
      await promote.mutateAsync({ id: promptId, versionId: v.id });
      await invalidatePath(qc, "/api/prompts");
      toast.success("Prompt set up");
    } catch {
      toast.error("Couldn’t save the prompt");
    }
  };

  return (
    <section className="rounded-[12px] border-[1.5px] border-warn/50 bg-warn/[0.06] p-4">
      <div className="flex items-center gap-2 text-warn">
        <TriangleAlert className="size-4" />
        <h3 className="text-[13px] font-semibold">Set up this prompt</h3>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        It has no instructions yet, so it can’t run on the mind map. Write what it should generate — the
        script and (when keywords are on) the project keywords are added automatically.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="mt-3 min-h-[140px] leading-relaxed"
        aria-label="Prompt instructions"
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={save} disabled={pending || text.trim().length === 0}>
          {pending ? "Saving…" : "Save & set as main"}
        </Button>
      </div>
    </section>
  );
}

/* ---------------- editable name ---------------- */
/** Inline rename of the prompt's title. Saves via PUT /api/prompts/{id} which only repoints
 *  Prompt.Name — it does NOT create a new PromptVersion/draft. Always sends the current
 *  `useKeywords` flag alongside `name` so the rename can't clear it. */
function EditablePromptName({
  promptId,
  promptName,
  useKeywords,
}: {
  promptId: string;
  promptName: string;
  useKeywords: boolean;
}) {
  const qc = useQueryClient();
  const rename = usePutApiPromptsId();
  // `null` = not editing. A string = the live draft, seeded from the current name when editing opens.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const cancel = () => setDraft(null);

  const save = () => {
    const next = (draft ?? "").trim();
    if (!next || next === promptName) {
      cancel();
      return;
    }
    rename.mutate(
      { id: promptId, data: { name: next, useKeywords } },
      {
        onSuccess: async () => {
          await invalidatePath(qc, "/api/prompts");
          toast.success("Renamed");
          setDraft(null);
        },
        onError: () => toast.error("Rename failed"),
      },
    );
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setDraft(promptName)}
        title="Rename prompt"
        className="group/name -mx-1 flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent"
      >
        <span className="truncate text-[17px] leading-tight font-[650]">{promptName}</span>
        <Pencil className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover/name:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={draft ?? ""}
        disabled={rename.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="h-8 text-[15px] font-semibold"
        aria-label="Prompt name"
      />
      <Button
        type="button"
        size="icon-sm"
        onClick={save}
        disabled={rename.isPending}
        aria-label="Save name"
      >
        <Check className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={cancel}
        disabled={rename.isPending}
        aria-label="Cancel rename"
      >
        <X className="size-3.5" />
      </Button>
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
