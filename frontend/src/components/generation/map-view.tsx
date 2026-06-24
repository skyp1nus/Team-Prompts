"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  Heart,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  useDeleteApiGenerationSessionsSessionId,
  usePostApiGenerationSessionsSessionIdRegenerate,
} from "@/api/endpoints/generation/generation";
import {
  useDeleteApiResultsResultIdFavorite,
  useDeleteApiResultsResultIdHighlight,
  usePostApiResultsResultIdCopy,
  usePostApiResultsResultIdFavorite,
  usePostApiResultsResultIdHighlight,
} from "@/api/endpoints/results/results";
import { SessionStatus, type GenerationResultDto, type SessionWithResultsDto, type UserRef } from "@/api/model";
import { AddModelMenu } from "@/components/generation/add-model-menu";
import { Button } from "@/components/ui/button";
import { formatRelative, modelLabel } from "@/lib/format";
import { providerDot, providerOf } from "@/lib/models";
import { invalidatePath } from "@/lib/query/invalidate";
import { useGenerationStream } from "@/lib/realtime/generation-stream";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export type Group = { promptId: string; promptName: string; sessions: SessionWithResultsDto[] };

const MIN_Z = 0.3;
const MAX_Z = 2.5;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, +z.toFixed(3)));

/** How many characters a collapsed result row should fit before truncating. */
const PREVIEW_MAX = 100;

type Transform = { z: number; tx: number; ty: number };
type Hover = { type: "prompt" | "col"; id: string } | null;
type Edge = {
  key: string;
  promptId: string;
  colId: string;
  color: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  d: string;
};

/**
 * Node-flow map (design "Team Prompts - Map (shadcn)"). Each prompt is a lane that flows
 * left → right: the prompt node on the left, one output node per model on the right, joined by
 * provider-coloured bezier edges from the prompt card's right edge to each output card's left edge.
 */
export function MapView({ groups, scriptId }: { groups: Group[]; scriptId: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const tRef = useRef<Transform>({ z: 0.8, tx: 40, ty: 28 });
  const initedRef = useRef(false);
  const panningRef = useRef(false);

  const [t, setT] = useState<Transform>({ z: 0.8, tx: 40, ty: 28 });
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [sizeTick, setSizeTick] = useState(0);
  const [hover, setHover] = useState<Hover>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [svg, setSvg] = useState({ w: 0, h: 0 });

  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const bumpLayout = useCallback(() => setLayoutVersion((v) => v + 1), []);

  const zoomAt = useCallback((nz: number, px: number, py: number) => {
    setT((p) => {
      const z = clampZ(nz);
      const cx = (px - p.tx) / p.z;
      const cy = (py - p.ty) / p.z;
      return { z, tx: px - cx * z, ty: py - cy * z };
    });
  }, []);

  /* ---- pan + wheel-zoom (ported from the design) ---- */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        zoomAt(tRef.current.z * Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
      } else {
        setT((p) => ({ ...p, tx: p.tx - e.deltaX, ty: p.ty - e.deltaY }));
      }
    };

    let lx = 0;
    let ly = 0;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (e.button !== 0 || target.closest("[data-node]") || target.closest("button")) return;
      panningRef.current = true;
      lx = e.clientX;
      ly = e.clientY;
      vp.classList.add("cursor-grabbing");
      setHover(null);
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!panningRef.current) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      setT((p) => ({ ...p, tx: p.tx + dx, ty: p.ty + dy }));
    };
    const onUp = () => {
      if (panningRef.current) {
        panningRef.current = false;
        vp.classList.remove("cursor-grabbing");
      }
    };

    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [zoomAt]);

  const zoomCenter = (factor: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(tRef.current.z * factor, vp.clientWidth / 2, vp.clientHeight / 2);
  };

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const layer = layerRef.current;
    if (!vp || !layer) return;
    const cw = layer.scrollWidth;
    const ch = layer.scrollHeight;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!cw || !ch || !vw) return;
    const z = clampZ(Math.min((vw - 56) / cw, (vh - 56) / ch, 1));
    setT({ z, tx: Math.max(28, (vw - cw * z) / 2), ty: Math.max(28, (vh - ch * z) / 2) });
  }, []);

  const initFit = useCallback(() => {
    const vp = viewportRef.current;
    const layer = layerRef.current;
    if (!vp || !layer) return;
    const cw = layer.scrollWidth;
    const vw = vp.clientWidth;
    if (!cw || !vw) return;
    const z = Math.max(0.55, +Math.min((vw - 56) / cw, 1).toFixed(3));
    setT({ z, tx: Math.max(28, (vw - cw * z) / 2), ty: 28 });
  }, []);

  /* one-time initial fit once nodes exist */
  useEffect(() => {
    if (initedRef.current || groups.length === 0) return;
    initedRef.current = true;
    requestAnimationFrame(initFit);
  }, [groups.length, initFit]);

  /* recompute edges only on layout / resize — NOT on pan/zoom. Edges run horizontally from each
     prompt card's right-middle to each output card's left-middle. */
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) {
      setEdges([]);
      return;
    }
    const z = t.z;
    const base = layer.getBoundingClientRect();
    const next: Edge[] = [];
    layer.querySelectorAll<HTMLElement>("[data-prompt]").forEach((pr) => {
      const pid = pr.dataset.prompt!;
      const card = pr.querySelector<HTMLElement>("[data-card]");
      if (!card) return;
      const rr = card.getBoundingClientRect();
      const ax = (rr.right - base.left) / z;
      const ay = (rr.top + rr.height / 2 - base.top) / z;
      layer.querySelectorAll<HTMLElement>(`[data-col-parent="${pid}"]`).forEach((out) => {
        const cid = out.dataset.col!;
        const oc = out.querySelector<HTMLElement>("[data-card]");
        if (!oc) return;
        const cr = oc.getBoundingClientRect();
        const bx = (cr.left - base.left) / z;
        const by = (cr.top + cr.height / 2 - base.top) / z;
        const dx = Math.max(60, (bx - ax) * 0.5);
        next.push({
          key: `${pid}__${cid}`,
          promptId: pid,
          colId: cid,
          color: out.dataset.ec || "var(--border-strong)",
          ax,
          ay,
          bx,
          by,
          d: `M${ax} ${ay} C${ax + dx} ${ay} ${bx - dx} ${by} ${bx} ${by}`,
        });
      });
    });
    setEdges(next);
    setSvg({ w: layer.scrollWidth, h: layer.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, layoutVersion, sizeTick]);

  /* resize → recompute edges */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => setSizeTick((s) => s + 1));
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  const dim = hover !== null;

  return (
    <div
      ref={viewportRef}
      className="canvas-grid absolute inset-0 cursor-grab overflow-hidden bg-muted"
      style={{
        backgroundSize: `${22 * t.z}px ${22 * t.z}px`,
        backgroundPosition: `${t.tx}px ${t.ty}px`,
      }}
    >
      <div
        ref={layerRef}
        className="absolute top-0 left-0 w-max origin-top-left px-14 py-3.5 will-change-transform"
        style={{ transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.z})` }}
      >
        <svg
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          style={{ width: svg.w, height: svg.h, zIndex: 0 }}
        >
          {edges.map((e) => {
            const hot =
              (hover?.type === "col" && hover.id === e.colId) ||
              (hover?.type === "prompt" && hover.id === e.promptId);
            return (
              <g key={e.key} style={{ opacity: dim && !hot ? 0.18 : 1, transition: "opacity .16s" }}>
                <path
                  d={e.d}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={hot ? 3 : 2}
                  strokeLinecap="round"
                  style={{ transition: "stroke-width .16s" }}
                />
                <circle cx={e.ax} cy={e.ay} r={hot ? 4.5 : 3.4} fill={e.color} />
                <circle cx={e.bx} cy={e.by} r={hot ? 4.5 : 3.4} fill={e.color} />
              </g>
            );
          })}
        </svg>

        <div className="relative flex w-max flex-col gap-16" style={{ zIndex: 1 }}>
          {groups.map((g) => {
            const promptLit =
              (hover?.type === "prompt" && hover.id === g.promptId) ||
              (hover?.type === "col" && (hover.id ?? "").startsWith(`${g.promptId}::`));
            return (
              <div key={g.promptId} className="relative flex w-max items-start gap-[132px]">
                <PromptNode
                  group={g}
                  scriptId={scriptId}
                  lit={promptLit}
                  onHover={(h) => {
                    if (panningRef.current) return;
                    setHover(h ? { type: "prompt", id: g.promptId } : null);
                  }}
                />
                <div className="flex flex-col gap-[34px]">
                  {groupModels(g.sessions).map((mg) => {
                    const colId = `${g.promptId}::${mg.model}`;
                    return (
                      <OutputNode
                        key={colId}
                        colId={colId}
                        model={mg.model}
                        runs={mg.runs}
                        promptId={g.promptId}
                        scriptId={scriptId}
                        lit={
                          (hover?.type === "col" && hover.id === colId) ||
                          (hover?.type === "prompt" && hover.id === g.promptId)
                        }
                        onHover={(h) => {
                          if (panningRef.current) return;
                          setHover(h ? { type: "col", id: colId } : null);
                        }}
                        onLayoutChange={bumpLayout}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* zoom controls (design .map-zoom) */}
      <div className="absolute right-4 bottom-4 z-20 flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-md">
        <ZoomBtn onClick={() => zoomCenter(1 / 1.6)} label="Zoom out">
          <Minus className="size-4" />
        </ZoomBtn>
        <button
          onClick={() => zoomAt(1, (viewportRef.current?.clientWidth ?? 0) / 2, (viewportRef.current?.clientHeight ?? 0) / 2)}
          className="min-w-[50px] rounded-lg px-1 text-xs font-semibold text-foreground tabular-nums transition-colors hover:bg-accent"
          title="Reset to 100%"
        >
          {Math.round(t.z * 100)}%
        </button>
        <ZoomBtn onClick={() => zoomCenter(1.6)} label="Zoom in">
          <Plus className="size-4" />
        </ZoomBtn>
        <span className="mx-0.5 h-[18px] w-px bg-border" />
        <ZoomBtn onClick={fit} label="Fit to view">
          <Maximize2 className="size-4" />
        </ZoomBtn>
      </div>
    </div>
  );
}

function ZoomBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-[30px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

/* ============================ PROMPT NODE ============================ */
/** Left side of a lane: the prompt, with a "Generate" run across every model + add-model menu. */
function PromptNode({
  group,
  scriptId,
  lit,
  onHover,
}: {
  group: Group;
  scriptId: string;
  lit: boolean;
  onHover: (hovering: boolean) => void;
}) {
  const qc = useQueryClient();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const total = group.sessions.reduce((a, s) => a + s.results.length, 0);
  const models = groupModels(group.sessions);
  const modelCount = models.length;
  const latest = group.sessions[group.sessions.length - 1];
  const invalidate = () => invalidatePath(qc, `/api/scripts/${scriptId}/sessions`);

  const regenMore = () => {
    // one fresh run per model — from each model's newest run as the template
    models.forEach(({ runs }) => {
      const newest = [...runs].sort(
        (a, b) => +new Date(b.session.createdAt) - +new Date(a.session.createdAt),
      )[0];
      regen.mutate({ sessionId: newest.session.id, data: { model: null } }, { onSuccess: invalidate });
    });
    toast.success("Regenerating…");
  };

  const addModel = (model: string | null) => {
    if (!model || !latest) return;
    regen.mutate(
      { sessionId: latest.session.id, data: { model } },
      {
        onSuccess: () => {
          invalidate();
          toast.success(`New run with ${modelLabel(model)}`);
        },
        onError: () => toast.error("Could not start run"),
      },
    );
  };

  return (
    <div
      data-node
      data-prompt={group.promptId}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="relative z-[2] w-[360px] shrink-0"
    >
      {/* fn-card — prompt body */}
      <div
        data-card
        className={cn(
          "relative rounded-[13px] border border-border bg-card shadow-md transition-[box-shadow,border-color]",
          lit && "border-border-strong shadow-lg",
        )}
      >
        <div className="relative min-h-[104px] px-4 pt-3.5 pb-[52px]">
          <div className="flex items-center gap-2.5">
            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-primary/[0.08] text-primary">
              <FileText className="size-[15px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow !text-[9px] tracking-[0.09em]">Prompt</div>
              <div className="truncate text-[15px] leading-tight font-[650] tracking-tight">
                {group.promptName}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            <b className="font-bold text-foreground tabular-nums">{modelCount}</b> model
            {modelCount === 1 ? "" : "s"} ·{" "}
            <b className="font-bold text-foreground tabular-nums">{total}</b> result{total === 1 ? "" : "s"}
          </p>

          {/* run button pinned bottom-right (design .fn-run) */}
          <button
            onClick={regenMore}
            disabled={regen.isPending}
            className="absolute right-3 bottom-3 flex h-[29px] items-center gap-1.5 rounded-lg bg-primary pr-2.5 pl-3 text-[12.5px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {regen.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Generate
          </button>
        </div>
      </div>

      {/* fn-bar — detached footer toolbar */}
      <div className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border border-border bg-card p-1.5 shadow-sm">
        <span className="flex min-w-0 items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
          <FileText className="size-3.5 shrink-0 text-faint" />
          <span className="truncate">{modelCount} model{modelCount === 1 ? "" : "s"}</span>
        </span>
        <span className="flex-1" />
        <div className="flex w-[112px]">
          <AddModelMenu
            onPick={addModel}
            existing={group.sessions.map((s) => s.session.model)}
            disabled={regen.isPending}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================ OUTPUT NODE ============================ */
/** Buckets a prompt group's sessions into one entry per model, in first-appearance order. */
function groupModels(sessions: SessionWithResultsDto[]): { model: string; runs: SessionWithResultsDto[] }[] {
  const map = new Map<string, SessionWithResultsDto[]>();
  for (const s of sessions) {
    if (!map.has(s.session.model)) map.set(s.session.model, []);
    map.get(s.session.model)!.push(s);
  }
  return [...map.entries()].map(([model, runs]) => ({ model, runs }));
}

/** Right side of a lane: one card per model. Each "Generate" adds a fresh run inside, newest first. */
function OutputNode({
  colId,
  model,
  runs,
  promptId,
  scriptId,
  lit,
  onHover,
  onLayoutChange,
}: {
  colId: string;
  model: string;
  runs: SessionWithResultsDto[];
  promptId: string;
  scriptId: string;
  lit: boolean;
  onHover: (hovering: boolean) => void;
  onLayoutChange: () => void;
}) {
  const { live } = useGenerationStream();
  const qc = useQueryClient();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const copyEvent = usePostApiResultsResultIdCopy();
  const deleteRun = useDeleteApiGenerationSessionsSessionId();
  const [copied, setCopied] = useState(false);
  const dot = providerDot(model);

  // Delete this model's whole output — every run/session for it. Confirm first; gone for everyone.
  const removeOutput = async () => {
    const ids = runs.map((r) => r.session.id);
    if (ids.length === 0 || deleteRun.isPending) return;
    const many = ids.length > 1;
    const ok = confirm(
      many
        ? `Delete this ${modelLabel(model)} output and all ${ids.length} runs? This can’t be undone.`
        : "Delete this run and its results? This can’t be undone.",
    );
    if (!ok) return;
    try {
      await Promise.all(ids.map((sessionId) => deleteRun.mutateAsync({ sessionId })));
      toast.success(many ? "Output deleted" : "Run deleted");
    } catch {
      toast.error("Couldn’t delete");
    } finally {
      invalidatePath(
        qc,
        `/api/scripts/${scriptId}/sessions`,
        `/api/scripts/${scriptId}/tray`,
        "/api/scripts",
      );
      onLayoutChange();
    }
  };

  const ordered = [...runs].sort(
    (a, b) => +new Date(b.session.createdAt) - +new Date(a.session.createdAt),
  );

  // Generate one more run for THIS model only (from its newest run as the template).
  const generateMore = () => {
    const newest = ordered[0];
    if (!newest) return;
    regen.mutate(
      { sessionId: newest.session.id, data: { model: null } },
      {
        onSuccess: () => {
          invalidatePath(qc, `/api/scripts/${scriptId}/sessions`);
          onLayoutChange();
        },
        onError: () => toast.error("Couldn’t generate"),
      },
    );
    toast.success("Generating…");
  };

  const isActive = (r: SessionWithResultsDto) => {
    const st = (live[r.session.id]?.status ?? r.session.status) as string;
    return st === SessionStatus.Streaming || st === SessionStatus.Queued;
  };
  // Show every run that has results, plus active runs. A failed/empty run is only shown when it's
  // the very latest attempt — so repeated rate-limited retries don't stack identical blocks.
  const displayed = ordered.filter((run, i) => run.results.length > 0 || isActive(run) || i === 0);
  const anyStreaming = ordered.some(isActive);

  // Size the card to this block's OWN longest result (capped at PREVIEW_MAX chars), not always to a
  // full 100 — so short-result blocks stay compact. Probe uses the real text for proportional-font
  // accuracy; ties broken by raw length.
  const longestContent = displayed
    .flatMap((run) => run.results)
    .reduce((longest, r) => (r.content.length > longest.length ? r.content : longest), "");
  const probeText = longestContent.slice(0, PREVIEW_MAX);
  // The newest run already shows its own "Try again" when it failed/emptied — so don't double up
  // with the header's generate button in that case.
  const newestFailed = !!ordered[0] && !isActive(ordered[0]) && ordered[0].results.length === 0;

  // Best result to copy from the bar = first favourite, else the newest run's first result.
  const best =
    ordered.flatMap((r) => r.results).find((r) => r.isFavorite) ?? ordered[0]?.results[0] ?? null;

  const copyBest = async () => {
    if (!best) return;
    try {
      await navigator.clipboard.writeText(best.content);
    } catch {
      toast.error("Couldn’t copy to clipboard");
      return;
    }
    copyEvent.mutate({ resultId: best.id });
    setCopied(true);
    toast.success("Copied");
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div
      data-node
      data-col-parent={promptId}
      data-col={colId}
      data-ec={dot}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="relative z-[2] w-fit shrink-0"
    >
      {/* fn-card — results body */}
      <div
        data-card
        className={cn(
          "rounded-[13px] border border-border bg-card shadow-md transition-[box-shadow,border-color]",
          lit && "border-border-strong shadow-lg",
        )}
      >
        <div className="flex flex-col gap-1.5 p-2.5">
          {/* Invisible sizer: makes the card exactly wide enough for THIS block's longest result
              (≤ PREVIEW_MAX chars), mirroring the real row's chevron + count + star. */}
          {probeText && (
            <div aria-hidden className="pointer-events-none h-0 overflow-hidden" data-width-probe>
              <div className="flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2">
                <span className="size-3.5 shrink-0" />
                <span className="text-[12.5px] leading-snug font-medium whitespace-nowrap">
                  {probeText}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums">000</span>
                <span className="size-[22px] shrink-0" />
              </div>
            </div>
          )}
          {displayed.map((run, i) => (
            <div key={run.session.id} className={cn(i > 0 && "mt-1 border-t border-border pt-2.5")}>
              {displayed.length > 1 && (
                <div className="mb-1.5 flex items-center justify-between px-0.5 text-[10px] text-faint">
                  <span className="font-semibold tracking-wide uppercase">
                    {i === 0 ? "Latest" : `Run ${displayed.length - i}`}
                  </span>
                  <span>{formatRelative(run.session.createdAt)}</span>
                </div>
              )}
              <RunBlock run={run} scriptId={scriptId} onLayoutChange={onLayoutChange} />
            </div>
          ))}
        </div>
      </div>

      {/* fn-bar — model + actions */}
      <div className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border border-border bg-card p-1.5 shadow-sm">
        <span className="flex min-w-0 items-center gap-2 px-1.5 text-[12px] font-medium">
          <span className="size-[7px] shrink-0 rounded-full" style={{ background: dot }} />
          <span className="min-w-0 truncate">{modelLabel(model)}</span>
          <span className="shrink-0 text-[10px] text-faint">{providerOf(model)}</span>
        </span>
        <span className="flex-1" />
        <button
          onClick={removeOutput}
          disabled={deleteRun.isPending}
          title={runs.length > 1 ? `Delete this output (${runs.length} runs)` : "Delete this run"}
          aria-label="Delete this output"
          className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
        >
          {deleteRun.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </button>
        {best && (
          <button
            onClick={copyBest}
            title="Copy best result"
            aria-label="Copy best result"
            className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          </button>
        )}
        {!newestFailed && (
          <button
            onClick={generateMore}
            disabled={regen.isPending || anyStreaming}
            title="Generate more"
            aria-label="Generate more"
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
          >
            {anyStreaming || regen.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {anyStreaming ? "Running" : "Generate"}
          </button>
        )}
      </div>
    </div>
  );
}

/** One generation run inside an output card: its live stream, results, or failed state + retry. */
function RunBlock({
  run,
  scriptId,
  onLayoutChange,
}: {
  run: SessionWithResultsDto;
  scriptId: string;
  onLayoutChange: () => void;
}) {
  const { live } = useGenerationStream();
  const qc = useQueryClient();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const ls = live[run.session.id];
  const status = (ls?.status ?? run.session.status) as string;
  const streaming = status === SessionStatus.Streaming || status === SessionStatus.Queued;
  const failed = status === SessionStatus.Failed;
  const error = (ls?.error ?? run.session.error) ?? null;
  const rateLimited = !!error && error.includes("429");

  const results = [...run.results].sort((a, b) => a.index - b.index);
  const resultIndices = new Set(results.map((r) => r.index));
  const liveDeltas = ls
    ? Object.entries(ls.deltas).filter(([idx]) => !resultIndices.has(Number(idx)))
    : [];

  const retry = () => {
    regen.mutate(
      { sessionId: run.session.id, data: { model: null } },
      {
        onSuccess: () => {
          invalidatePath(qc, `/api/scripts/${scriptId}/sessions`);
          onLayoutChange();
        },
        onError: () => toast.error("Couldn’t retry"),
      },
    );
    toast.success("Retrying…");
  };

  return (
    <div className="flex flex-col gap-1.5">
      {streaming && liveDeltas.length === 0 && <StreamingRow />}
      {streaming &&
        liveDeltas.map(([idx, text]) => (
          <div
            key={idx}
            className="rounded-[10px] border border-border bg-card px-3 py-2.5 text-[12.5px] leading-snug"
          >
            {text}
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground/60 align-text-bottom" />
          </div>
        ))}
      {results.map((r) => (
        <ResultRow key={r.id} result={r} scriptId={scriptId} onLayoutChange={onLayoutChange} />
      ))}
      {!streaming && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-2 py-3 text-center">
          <p className="text-[11.5px] text-faint">
            {failed
              ? rateLimited
                ? "Provider rate-limited (free tier)."
                : "Generation failed."
              : "No results."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={retry}
            disabled={regen.isPending}
            className="h-7 gap-1.5 px-2.5 text-[11.5px]"
          >
            <RotateCw className={cn("size-3", regen.isPending && "animate-spin")} />
            Try again
          </Button>
        </div>
      )}
      {!streaming && failed && results.length > 0 && (
        <button
          onClick={retry}
          disabled={regen.isPending}
          className="flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border-strong px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          <RotateCw className={cn("size-3", regen.isPending && "animate-spin")} />
          Retry — partial result
        </button>
      )}
    </div>
  );
}

function StreamingRow() {
  return (
    <div className="flex animate-pulse items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-[11.5px] text-faint">
      <Loader2 className="size-3.5 animate-spin" /> generating variants…
    </div>
  );
}

/* ============================ RESULT ROW ============================ */
function ResultRow({
  result,
  scriptId,
  onLayoutChange,
}: {
  result: GenerationResultDto;
  scriptId: string;
  onLayoutChange: () => void;
}) {
  const qc = useQueryClient();
  const { showHighlightsOnly } = useWorkspace();
  const [open, setOpen] = useState(false);
  const fav = usePostApiResultsResultIdFavorite();
  const removeFav = useDeleteApiResultsResultIdFavorite();
  const highlight = usePostApiResultsResultIdHighlight();
  const removeHighlight = useDeleteApiResultsResultIdHighlight();
  const copyEvent = usePostApiResultsResultIdCopy();
  const isFav = result.isFavorite;
  const isHi = result.isHighlighted;
  const hiBy = result.highlightedBy as UserRef | null | undefined;
  const dimmed = showHighlightsOnly && !isHi;

  // Collapsed rows show at most PREVIEW_MAX chars; the card is sized to fit exactly that many.
  const preview =
    result.content.length > PREVIEW_MAX ? `${result.content.slice(0, PREVIEW_MAX)}…` : result.content;

  const invalidate = () =>
    invalidatePath(qc, `/api/scripts/${scriptId}/sessions`, `/api/scripts/${scriptId}/tray`);

  const toggleFav = () => {
    (isFav ? removeFav : fav).mutate(
      { resultId: result.id },
      {
        onSuccess: () => {
          invalidate();
          toast.success(isFav ? "Removed from tray" : "Added to tray");
        },
      },
    );
  };

  const toggleHighlight = () => {
    (isHi ? removeHighlight : highlight).mutate(
      { resultId: result.id },
      {
        onSuccess: () => {
          invalidate();
          toast.success(isHi ? "Highlight removed" : "Highlighted for the team");
        },
      },
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.content);
    } catch {
      toast.error("Couldn’t copy to clipboard");
      return;
    }
    copyEvent.mutate({ resultId: result.id }, { onSuccess: invalidate });
    toast.success("Copied");
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-border bg-card transition-[color,background-color,border-color,opacity]",
        isFav && "border-primary bg-primary/[0.06]",
        isHi && "ring-1 ring-rose-400/60",
        open && "border-border-strong",
        dimmed && "opacity-30 hover:opacity-100",
      )}
    >
      <div
        className={cn(
          "flex cursor-pointer gap-2.5 px-2.5 py-2",
          open ? "items-start" : "items-center",
        )}
        onClick={() => {
          setOpen((o) => !o);
          onLayoutChange();
        }}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "mt-[3px] rotate-90",
          )}
        />
        <span className={cn("min-w-0 flex-1 text-[12.5px] leading-snug font-medium", !open && "truncate")}>
          {open ? result.content : preview}
        </span>
        <span className={cn("shrink-0 text-[10px] text-faint tabular-nums", open && "mt-[3px]")}>
          {result.content.length}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleHighlight();
          }}
          title={
            isHi
              ? hiBy
                ? `Highlighted by ${hiBy.displayName} — click to remove`
                : "Remove highlight"
              : "Highlight this result for the team"
          }
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors",
            open && "-mt-[1px]",
            isHi
              ? "border-rose-400 bg-rose-500/10 text-rose-500"
              : "border-border-strong text-faint hover:border-rose-400 hover:text-rose-500",
          )}
        >
          <Heart className={cn("size-3.5", isHi && "fill-current")} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFav();
          }}
          title={isFav ? "Remove from tray" : "Add to tray"}
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-[13px] font-semibold transition-colors",
            open && "-mt-[1px]",
            isFav
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong text-faint hover:border-primary hover:text-primary",
          )}
        >
          {isFav ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
        </button>
      </div>
      {open && (
        <div className="animate-rise pr-3 pb-3 pl-9">
          <div className="flex items-center gap-3 text-[10.5px] text-faint">
            <span>{result.content.length} chars</span>
            {result.favoriteCount > 0 && <span>★ {result.favoriteCount}</span>}
            {result.copyCount > 0 && <span>copied {result.copyCount}</span>}
            {isHi && hiBy && <span className="text-rose-500">♥ {hiBy.displayName}</span>}
          </div>
          <div className="mt-2.5">
            <button
              onClick={copy}
              className="rounded-md border border-primary/20 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
