"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { usePostApiGenerationSessionsSessionIdRegenerate } from "@/api/endpoints/generation/generation";
import {
  useDeleteApiResultsResultIdFavorite,
  usePostApiResultsResultIdCopy,
  usePostApiResultsResultIdFavorite,
} from "@/api/endpoints/results/results";
import { SessionStatus, type GenerationResultDto, type SessionWithResultsDto } from "@/api/model";
import { ModelSelect } from "@/components/generation/model-select";
import { Button } from "@/components/ui/button";
import { modelLabel } from "@/lib/format";
import { providerDot } from "@/lib/models";
import { invalidatePath } from "@/lib/query/invalidate";
import { useGenerationStream } from "@/lib/realtime/generation-stream";
import { cn } from "@/lib/utils";

export type Group = { promptId: string; promptName: string; sessions: SessionWithResultsDto[] };

const MIN_Z = 0.3;
const MAX_Z = 2.5;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, +z.toFixed(3)));

type Transform = { z: number; tx: number; ty: number };
type Hover = { type: "prompt" | "col"; id: string } | null;
type Edge = {
  key: string;
  promptId: string;
  colId: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  d: string;
};

export function MapView({ groups, scriptId }: { groups: Group[]; scriptId: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const tRef = useRef<Transform>({ z: 0.8, tx: 40, ty: 28 });
  const initedRef = useRef(false);
  const panningRef = useRef(false);

  const [t, setT] = useState<Transform>({ z: 0.8, tx: 40, ty: 28 });
  const [collapsedPrompts, setCollapsedPrompts] = useState<Set<string>>(new Set());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [sizeTick, setSizeTick] = useState(0);
  const [hover, setHover] = useState<Hover>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [svg, setSvg] = useState({ w: 0, h: 0 });

  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const bumpLayout = useCallback(() => setLayoutVersion((v) => v + 1), []);

  const togglePromptCollapse = (id: string) => {
    setCollapsedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        zoomAt(tRef.current.z * Math.exp(-e.deltaY * 0.005), e.clientX - r.left, e.clientY - r.top);
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

  /* recompute edges only on layout / collapse / resize — NOT on pan/zoom */
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
      if (pr.dataset.collapsed === "true") return;
      const pid = pr.dataset.prompt!;
      const rr = pr.getBoundingClientRect();
      const ax = (rr.left + rr.width / 2 - base.left) / z;
      const ay = (rr.bottom - base.top) / z;
      layer.querySelectorAll<HTMLElement>(`[data-col-parent="${pid}"]`).forEach((col) => {
        const cid = col.dataset.col!;
        const cr = col.getBoundingClientRect();
        const bx = (cr.left + cr.width / 2 - base.left) / z;
        const by = (cr.top - base.top) / z;
        const my = ay + (by - ay) * 0.5;
        next.push({
          key: `${pid}__${cid}`,
          promptId: pid,
          colId: cid,
          ax,
          ay,
          bx,
          by,
          d: `M${ax} ${ay} C${ax} ${my} ${bx} ${my} ${bx} ${by}`,
        });
      });
    });
    setEdges(next);
    setSvg({ w: layer.scrollWidth, h: layer.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, collapsedPrompts, layoutVersion, sizeTick]);

  /* resize → re-fit on first layout + recompute edges */
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
        className="absolute top-0 left-0 w-max origin-top-left will-change-transform"
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
            const stroke = hot ? "var(--primary)" : "var(--border-strong)";
            return (
              <g key={e.key} style={{ opacity: dim && !hot ? 0.16 : 1, transition: "opacity .16s" }}>
                <path d={e.d} fill="none" stroke={stroke} strokeWidth={hot ? 2.5 : 1.5} strokeLinecap="round" />
                <circle cx={e.ax} cy={e.ay} r={3.2} fill={stroke} />
                <circle cx={e.bx} cy={e.by} r={3} fill={stroke} />
              </g>
            );
          })}
        </svg>

        <div className="relative flex w-max flex-col gap-12" style={{ zIndex: 1 }}>
          {groups.map((g) => {
            const collapsed = collapsedPrompts.has(g.promptId);
            const promptLit =
              (hover?.type === "prompt" && hover.id === g.promptId) ||
              (hover?.type === "col" && g.sessions.some((s) => s.session.id === hover.id));
            return (
              <div key={g.promptId} className="flex w-max flex-col items-center">
                <PromptNode
                  group={g}
                  scriptId={scriptId}
                  collapsed={collapsed}
                  lit={promptLit}
                  onToggleCollapse={() => togglePromptCollapse(g.promptId)}
                  onHover={(h) => {
                    if (panningRef.current) return;
                    setHover(h ? { type: "prompt", id: g.promptId } : null);
                  }}
                  onLayoutChange={bumpLayout}
                />
                {!collapsed && (
                  <div className="relative flex items-start gap-6" style={{ zIndex: 1 }}>
                    {g.sessions.map((s) => (
                      <ModelColumn
                        key={s.session.id}
                        item={s}
                        promptId={g.promptId}
                        scriptId={scriptId}
                        lit={
                          (hover?.type === "col" && hover.id === s.session.id) ||
                          (hover?.type === "prompt" && hover.id === g.promptId)
                        }
                        onHover={(h) => {
                          if (panningRef.current) return;
                          setHover(h ? { type: "col", id: s.session.id } : null);
                        }}
                        onLayoutChange={bumpLayout}
                      />
                    ))}
                  </div>
                )}
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
function PromptNode({
  group,
  scriptId,
  collapsed,
  lit,
  onToggleCollapse,
  onHover,
  onLayoutChange,
}: {
  group: Group;
  scriptId: string;
  collapsed: boolean;
  lit: boolean;
  onToggleCollapse: () => void;
  onHover: (hovering: boolean) => void;
  onLayoutChange: () => void;
}) {
  const qc = useQueryClient();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const total = group.sessions.reduce((a, s) => a + s.results.length, 0);
  const latest = group.sessions[0];
  const invalidate = () => invalidatePath(qc, `/api/scripts/${scriptId}/sessions`);

  const regenMore = () => {
    group.sessions.forEach((s) =>
      regen.mutate({ sessionId: s.session.id, data: { model: null } }, { onSuccess: invalidate }),
    );
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
      data-collapsed={collapsed}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "relative z-[2] w-[312px] rounded-2xl border border-border bg-card px-4 pt-3.5 pb-3 shadow-md transition-[box-shadow,border-color]",
        collapsed ? "mb-2" : "mb-12",
        lit && "border-primary",
      )}
    >
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => {
            onToggleCollapse();
            onLayoutChange();
          }}
          className="flex size-[22px] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronRight className={cn("size-4 transition-transform", !collapsed && "rotate-90")} />
        </button>
        <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-primary/[0.08] text-primary">
          <FileText className="size-[15px]" />
        </div>
        <button
          onClick={() => {
            onToggleCollapse();
            onLayoutChange();
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="eyebrow !text-[9px] tracking-[0.09em]">Prompt</div>
          <div className="truncate text-[15px] leading-tight font-[650] tracking-tight">
            {group.promptName}
          </div>
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[11.5px] text-muted-foreground">
        <span>
          <b className="font-bold text-foreground tabular-nums">{group.sessions.length}</b> model
          {group.sessions.length === 1 ? "" : "s"}
        </span>
        <span className="size-[3px] rounded-full bg-faint" />
        <span>
          <b className="font-bold text-foreground tabular-nums">{total}</b> result{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          onClick={regenMore}
          disabled={regen.isPending}
          className="h-8 flex-1 gap-1.5 rounded-lg text-[11.5px] font-semibold"
        >
          <Sparkles className="size-3.5" /> Generate more
        </Button>
        <ModelSelect
          value={null}
          onChange={addModel}
          includeDefault={false}
          placeholder="+ Model"
          className="h-8 flex-1 rounded-lg text-[11.5px]"
        />
      </div>
    </div>
  );
}

/* ============================ MODEL COLUMN ============================ */
function ModelColumn({
  item,
  promptId,
  scriptId,
  lit,
  onHover,
  onLayoutChange,
}: {
  item: SessionWithResultsDto;
  promptId: string;
  scriptId: string;
  lit: boolean;
  onHover: (hovering: boolean) => void;
  onLayoutChange: () => void;
}) {
  const { live } = useGenerationStream();
  const [collapsed, setCollapsed] = useState(false);
  const ls = live[item.session.id];
  const status = (ls?.status ?? item.session.status) as string;
  const streaming = status === SessionStatus.Streaming || status === SessionStatus.Queued;

  const results = [...item.results].sort((a, b) => a.index - b.index);
  const model = item.session.model;
  const dot = providerDot(model);

  // only show live deltas for indices that don't yet have a finalized result
  const resultIndices = new Set(results.map((r) => r.index));
  const liveDeltas = ls
    ? Object.entries(ls.deltas).filter(([idx]) => !resultIndices.has(Number(idx)))
    : [];

  return (
    <div
      data-node
      data-col-parent={promptId}
      data-col={item.session.id}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "w-[288px] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[box-shadow,border-color] hover:shadow-md",
        lit && "border-primary shadow-md",
      )}
    >
      <button
        onClick={() => {
          setCollapsed((c) => !c);
          onLayoutChange();
        }}
        className={cn(
          "flex w-full items-center gap-2.5 bg-background px-3.5 py-3 text-left transition-colors hover:bg-accent",
          !collapsed && "border-b border-border",
        )}
      >
        <span className="flex size-[18px] shrink-0 items-center justify-center text-muted-foreground">
          <ChevronRight className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")} />
        </span>
        <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{modelLabel(model)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {streaming ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
              <Loader2 className="size-3 animate-spin" /> running…
            </span>
          ) : (
            <>
              {results.length} variant{results.length === 1 ? "" : "s"}
            </>
          )}
        </span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-1.5 p-2.5">
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
            <p className="px-2 py-3 text-center text-[11.5px] text-faint">No results.</p>
          )}
        </div>
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
  const [open, setOpen] = useState(false);
  const fav = usePostApiResultsResultIdFavorite();
  const removeFav = useDeleteApiResultsResultIdFavorite();
  const copyEvent = usePostApiResultsResultIdCopy();
  const isFav = result.isFavorite;

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
        "overflow-hidden rounded-[10px] border border-border bg-card transition-colors",
        isFav && "border-primary bg-primary/[0.06]",
        open && "border-border-strong",
      )}
    >
      <div
        className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5"
        onClick={() => {
          setOpen((o) => !o);
          onLayoutChange();
        }}
      >
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className={cn("min-w-0 flex-1 text-[12.5px] leading-snug font-medium", !open && "truncate")}>
          {result.content}
        </span>
        <span className="shrink-0 text-[10px] text-faint tabular-nums">{result.content.length}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFav();
          }}
          title={isFav ? "Remove from tray" : "Add to tray"}
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-[13px] font-semibold transition-colors",
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
          <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{result.content}</p>
          <div className="mt-2.5 flex items-center gap-3 text-[10.5px] text-faint">
            <span>{result.content.length} chars</span>
            {result.favoriteCount > 0 && <span>★ {result.favoriteCount}</span>}
            {result.copyCount > 0 && <span>copied {result.copyCount}</span>}
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
