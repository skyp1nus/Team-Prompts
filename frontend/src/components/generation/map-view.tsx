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
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
import {
  getGetApiScriptsIdCanvasQueryKey,
  getGetApiScriptsQueryKey,
  useDeleteApiScriptsIdCanvas,
  useGetApiScriptsIdCanvas,
  usePutApiScriptsIdCanvas,
} from "@/api/endpoints/scripts/scripts";
import { SessionStatus, type CanvasNodeDto, type GenerationResultDto, type SessionWithResultsDto, type UserRef } from "@/api/model";
import { AddModelMenu } from "@/components/generation/add-model-menu";
import { VersionBadge } from "@/components/generation/version-badge";
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

/* ---------- free-form canvas layout ---------- */
type XY = { x: number; y: number };
type FlatNode =
  | { key: string; kind: "prompt"; group: Group }
  | {
      key: string;
      kind: "col";
      group: Group;
      colId: string;
      model: string;
      runs: SessionWithResultsDto[];
    };

/** Layer padding + lane gaps, mirroring the design's flex layout so auto-placed blocks land where
 *  the old flow put them (px-14 / py-3.5, gap-16 lanes, gap-[132px] columns, gap-[34px] stacks). */
const PAD_X = 56;
const PAD_Y = 14;
const LANE_GAP_Y = 64;
const COL_GAP_X = 132;
const COL_GAP_Y = 34;
const PROMPT_W = 360;
/** Pointer travel (screen px) before a press becomes a drag — below it, the click passes through. */
const DRAG_THRESHOLD = 4;

const promptKey = (promptId: string) => `prompt:${promptId}`;
const colNodeKey = (colId: string) => `col:${colId}`;

function flattenNodes(groups: Group[]): FlatNode[] {
  const out: FlatNode[] = [];
  for (const g of groups) {
    out.push({ key: promptKey(g.promptId), kind: "prompt", group: g });
    for (const mg of groupModels(g.sessions)) {
      const colId = `${g.promptId}::${mg.model}`;
      out.push({ key: colNodeKey(colId), kind: "col", group: g, colId, model: mg.model, runs: mg.runs });
    }
  }
  return out;
}

/** Deterministic default grid (used only for blocks with no saved/known position): prompt on the
 *  left of each lane, its model outputs stacked to the right; lanes stacked top-to-bottom. */
function computeAutoGrid(groups: Group[], sizeOf: (k: string) => { w: number; h: number }): Record<string, XY> {
  const grid: Record<string, XY> = {};
  let y = PAD_Y;
  for (const g of groups) {
    const pKey = promptKey(g.promptId);
    const pSize = sizeOf(pKey);
    grid[pKey] = { x: PAD_X, y };
    const colX = PAD_X + (pSize.w || PROMPT_W) + COL_GAP_X;
    let cy = y;
    for (const mg of groupModels(g.sessions)) {
      const cKey = colNodeKey(`${g.promptId}::${mg.model}`);
      grid[cKey] = { x: colX, y: cy };
      cy += sizeOf(cKey).h + COL_GAP_Y;
    }
    const stacked = cy - COL_GAP_Y - y; // total height of the stacked outputs
    const laneHeight = Math.max(pSize.h, stacked, 0);
    y += laneHeight + LANE_GAP_Y;
  }
  return grid;
}

/**
 * Free-form node map (design "Team Prompts - Map (shadcn)"). Each block — a prompt lane on the left
 * and one output card per model on the right — is absolutely positioned and can be dragged anywhere,
 * Figma-style. Positions are saved per script and shared with the whole team (auto-layout is only the
 * starting arrangement). Provider-coloured bezier edges re-route to follow blocks as they move.
 */
export function MapView({ groups, scriptId }: { groups: Group[]; scriptId: string }) {
  const qc = useQueryClient();
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

  /* ---- canvas positions (shared, persisted) ---- */
  const { data: savedNodes } = useGetApiScriptsIdCanvas(scriptId, { query: { enabled: !!scriptId } });
  const saveCanvas = usePutApiScriptsIdCanvas();
  const resetCanvas = useDeleteApiScriptsIdCanvas();

  const nodes = useMemo(() => flattenNodes(groups), [groups]);
  const nodeKeys = useMemo(() => nodes.map((n) => n.key), [nodes]);
  const structuralKey = useMemo(() => nodeKeys.join("|"), [nodeKeys]);
  const serverPos = useMemo(() => {
    const m: Record<string, XY> = {};
    for (const n of savedNodes ?? []) m[n.nodeKey] = { x: n.x, y: n.y };
    return m;
  }, [savedNodes]);

  const [pos, setPos] = useState<Record<string, XY>>({});
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  const [ready, setReady] = useState(false);
  const [layerSize, setLayerSize] = useState({ w: 0, h: 0 });
  const [dragKey, setDragKey] = useState<string | null>(null);

  const nodeEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const nodeRoRef = useRef<ResizeObserver | null>(null);
  const setNodeEl = useCallback((key: string, el: HTMLDivElement | null) => {
    const prev = nodeEls.current.get(key);
    if (prev && prev !== el) nodeRoRef.current?.unobserve(prev);
    if (el) {
      nodeEls.current.set(key, el);
      nodeRoRef.current?.observe(el);
    } else {
      nodeEls.current.delete(key);
    }
  }, []);

  /* Re-measure when a block's own content grows/shrinks (live token streaming, expanding a result) —
     not just on viewport resize — so edges and the layer bbox keep following the block. */
  useEffect(() => {
    const ro = new ResizeObserver(() => setSizeTick((s) => s + 1));
    nodeRoRef.current = ro;
    for (const el of nodeEls.current.values()) ro.observe(el);
    return () => {
      ro.disconnect();
      nodeRoRef.current = null;
    };
  }, []);
  /** Measure a block in layer coordinates (screen size ÷ current zoom). */
  const sizeOf = useCallback((key: string) => {
    const el = nodeEls.current.get(key);
    const z = tRef.current.z || 1;
    if (!el) return { w: PROMPT_W, h: 120 };
    const r = el.getBoundingClientRect();
    return { w: r.width / z, h: r.height / z };
  }, []);

  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const bumpLayout = useCallback(() => setLayoutVersion((v) => v + 1), []);

  /* Wait for the saved layout before placing anything — otherwise auto-layout would seed first and
     the persisted positions (arriving a tick later) would be ignored. Switching scripts remounts
     this component (keyed on scriptId), so per-script state starts clean without a reset effect. */
  const canvasReady = !scriptId || savedNodes !== undefined;

  /* Resolve positions: a block that was dragged (has a saved position) stays put — manual placement
     is shared and always wins. Every other block is *auto*, so it follows the prompt order via the
     grid and reflows whenever that order (or the block set) changes. An actively-dragged block is left
     alone. Block sizes are measured from the DOM (rendered hidden until placed), so seeds never overlap.
     This runs on structural changes (reorder/add/remove encode into `structuralKey`) and on saved-node
     changes — not on every render — so streaming a token doesn't reshuffle the canvas. */
  useLayoutEffect(() => {
    if (!canvasReady) return;
    setPos((prev) => {
      const keySet = new Set(nodeKeys);
      const grid = computeAutoGrid(groups, sizeOf);
      const next: Record<string, XY> = {};
      // A removed block is a change even though it never makes it into `next`.
      let changed = Object.keys(prev).some((k) => !keySet.has(k));
      for (const k of nodeKeys) {
        const target =
          dragRef.current?.key === k
            ? prev[k] ?? grid[k] ?? { x: PAD_X, y: PAD_Y } // don't yank a block out from under a drag
            : serverPos[k] ?? grid[k] ?? { x: PAD_X, y: PAD_Y };
        next[k] = target;
        const p = prev[k];
        if (!p || p.x !== target.x || p.y !== target.y) changed = true;
      }
      return changed ? next : prev;
    });
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, structuralKey, serverPos, sizeOf]);

  /* Size the layer to the blocks' bounding box so pan/fit and the grid background cover everything. */
  useLayoutEffect(() => {
    if (!ready) return;
    let w = 0;
    let h = 0;
    for (const k of nodeKeys) {
      const p = pos[k];
      if (!p) continue;
      const s = sizeOf(k);
      w = Math.max(w, p.x + s.w);
      h = Math.max(h, p.y + s.h);
    }
    const nw = w + PAD_X;
    const nh = h + PAD_Y;
    setLayerSize((ls) => (ls.w === nw && ls.h === nh ? ls : { w: nw, h: nh }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, ready, structuralKey, sizeOf, layoutVersion, sizeTick]);

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
      // A press on a block drags the block (handled per-node); panning only starts on empty canvas.
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

  /* ---- per-block dragging (Figma-style free move) ---- */
  const dragRef = useRef<{
    key: string;
    sx: number;
    sy: number;
    px: number;
    py: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const swallowClickRef = useRef(false);

  const persistPositions = useCallback(
    (moved: { nodeKey: string; x: number; y: number }[]) => {
      if (!scriptId || moved.length === 0) return;
      // Optimistically fold the drop into the shared canvas cache so these blocks count as *manual*
      // placements immediately. Otherwise a structural change (a new model column, or the team
      // reordering prompts) would reflow them back to the auto-grid before the canvas query refetches.
      qc.setQueryData<CanvasNodeDto[]>(getGetApiScriptsIdCanvasQueryKey(scriptId), (prev) => {
        const byKey = new Map((prev ?? []).map((n) => [n.nodeKey, n]));
        for (const m of moved) byKey.set(m.nodeKey, { nodeKey: m.nodeKey, x: m.x, y: m.y });
        return [...byKey.values()];
      });
      saveCanvas.mutate(
        { id: scriptId, data: { nodes: moved } },
        {
          onError: () => {
            toast.error("Couldn’t save the layout");
            // Roll the optimistic write back to the server's truth so a failed save doesn't leave the
            // block pinned (counted as manual, excluded from auto-reflow) until the next incidental refetch.
            qc.invalidateQueries({ queryKey: getGetApiScriptsIdCanvasQueryKey(scriptId) });
          },
        },
      );
    },
    [scriptId, saveCanvas, qc],
  );

  const onNodePointerDown = (key: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Clear any stale swallow flag BEFORE the interactive-control early-return — a previous drag may
    // have been released over empty canvas / a different block, where no per-node click ever fired to
    // clear it. Otherwise the next button press here would be wrongly eaten.
    swallowClickRef.current = false;
    const target = e.target as HTMLElement;
    // Let interactive controls (Generate, star, expand…) work without starting a drag.
    if (target.closest("button, a, input, textarea, select, [data-no-drag]")) return;
    const p = posRef.current[key];
    if (!p) return;
    dragRef.current = { key, sx: p.x, sy: p.y, px: e.clientX, py: e.clientY, moved: false, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onNodePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragKey(d.key);
      setHover(null);
    }
    const z = tRef.current.z || 1;
    setPos((prev) => ({ ...prev, [d.key]: { x: d.sx + dx / z, y: d.sy + dy / z } }));
  };
  const onNodePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (d.moved) {
      swallowClickRef.current = true; // eat the click that fires right after the drag
      setDragKey(null);
      const fp = posRef.current[d.key];
      if (fp) persistPositions([{ nodeKey: d.key, x: fp.x, y: fp.y }]);
    }
  };
  const onNodeClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swallowClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      swallowClickRef.current = false;
    }
  };

  const zoomCenter = (factor: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(tRef.current.z * factor, vp.clientWidth / 2, vp.clientHeight / 2);
  };

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const cw = layerSize.w;
    const ch = layerSize.h;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!cw || !ch || !vw) return;
    const z = clampZ(Math.min((vw - 56) / cw, (vh - 56) / ch, 1));
    setT({ z, tx: Math.max(28, (vw - cw * z) / 2), ty: Math.max(28, (vh - ch * z) / 2) });
  }, [layerSize.w, layerSize.h]);

  const initFit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const cw = layerSize.w;
    const vw = vp.clientWidth;
    if (!cw || !vw) return;
    const z = Math.max(0.55, +Math.min((vw - 56) / cw, 1).toFixed(3));
    setT({ z, tx: Math.max(28, (vw - cw * z) / 2), ty: 28 });
  }, [layerSize.w]);

  /* one-time initial fit once the first layout is resolved */
  useEffect(() => {
    if (initedRef.current || !ready || layerSize.w === 0) return;
    initedRef.current = true;
    requestAnimationFrame(initFit);
  }, [ready, layerSize.w, initFit]);

  /* Reset every block back to auto-layout (shared). */
  const onResetLayout = () => {
    if (!scriptId || resetCanvas.isPending) return;
    resetCanvas.mutate(
      { id: scriptId },
      {
        onSuccess: () => {
          qc.setQueryData(getGetApiScriptsIdCanvasQueryKey(scriptId), []);
          // Re-seed the auto-grid synchronously from current measurements. Don't rely on the placement
          // effect re-running: setQueryData([]) structurally shares the same [] reference when the
          // canvas was already empty, so serverPos wouldn't change and the effect wouldn't fire —
          // leaving every block stuck hidden.
          setPos(computeAutoGrid(groups, sizeOf));
          setReady(true);
          toast.success("Layout reset");
        },
        onError: () => toast.error("Couldn’t reset the layout"),
      },
    );
  };

  /* Recompute edges on layout / resize / drag. Edges run from each prompt card's right-middle to
     each output card's left-middle, reading live DOM rects so they follow blocks as they move. */
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) {
      setEdges([]);
      return;
    }
    const z = tRef.current.z || 1;
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
        const dx = Math.max(60, Math.abs(bx - ax) * 0.5);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey, layoutVersion, sizeTick, pos, layerSize.w, layerSize.h]);

  /* resize → recompute edges */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => setSizeTick((s) => s + 1));
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  const dim = hover !== null;
  const litOf = (n: FlatNode) => {
    if (!hover) return false;
    if (n.kind === "prompt")
      return (
        (hover.type === "prompt" && hover.id === n.group.promptId) ||
        (hover.type === "col" && hover.id.startsWith(`${n.group.promptId}::`))
      );
    return (
      (hover.type === "col" && hover.id === n.colId) ||
      (hover.type === "prompt" && hover.id === n.group.promptId)
    );
  };

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
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{
          transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.z})`,
          width: layerSize.w || "max-content",
          height: layerSize.h || "100%",
        }}
      >
        <svg
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          style={{ width: layerSize.w, height: layerSize.h, zIndex: 0 }}
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

        {nodes.map((n) => {
          const p = pos[n.key];
          const lit = litOf(n);
          return (
            <div
              key={n.key}
              ref={(el) => setNodeEl(n.key, el)}
              data-node
              data-canvas-node={n.key}
              onPointerDown={onNodePointerDown(n.key)}
              onPointerMove={onNodePointerMove}
              onPointerUp={onNodePointerUp}
              onPointerCancel={onNodePointerUp}
              onClickCapture={onNodeClickCapture}
              className={cn(
                "absolute top-0 left-0 touch-none select-none",
                dragKey === n.key ? "cursor-grabbing" : "cursor-grab",
              )}
              style={{
                transform: `translate(${p?.x ?? 0}px, ${p?.y ?? 0}px)`,
                zIndex: dragKey === n.key ? 50 : 1,
                visibility: p && ready ? "visible" : "hidden",
              }}
            >
              {n.kind === "prompt" ? (
                <PromptNode
                  group={n.group}
                  scriptId={scriptId}
                  lit={lit}
                  onHover={(h) => {
                    if (panningRef.current || dragRef.current) return;
                    setHover(h ? { type: "prompt", id: n.group.promptId } : null);
                  }}
                />
              ) : (
                <OutputNode
                  colId={n.colId}
                  model={n.model}
                  runs={n.runs}
                  promptId={n.group.promptId}
                  scriptId={scriptId}
                  lit={lit}
                  onHover={(h) => {
                    if (panningRef.current || dragRef.current) return;
                    setHover(h ? { type: "col", id: n.colId } : null);
                  }}
                  onLayoutChange={bumpLayout}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* zoom + layout controls (design .map-zoom) */}
      <div className="absolute right-4 bottom-4 z-20 flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-md">
        <ZoomBtn onClick={onResetLayout} label="Reset layout — tidy every block back into place">
          {resetCanvas.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        </ZoomBtn>
        <span className="mx-0.5 h-[18px] w-px bg-border" />
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
  const { promptVersions } = useWorkspace();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const total = group.sessions.reduce((a, s) => a + s.results.length, 0);
  const models = groupModels(group.sessions);
  const modelCount = models.length;
  const latest = group.sessions[group.sessions.length - 1];
  const invalidate = () => invalidatePath(qc, `/api/scripts/${scriptId}/sessions`);
  // Version every regen/add-model will run: the pinned pick for this prompt, else its current main.
  const pin = promptVersions[group.promptId];
  const pinnedVersionId = pin?.versionId ?? null;
  // Badge for the next run: the pin, else the prompt's main (read off whichever session ran main).
  const mainSession = group.sessions.find((s) => s.session.isMainVersion);
  const nextNumber = pin?.number ?? mainSession?.session.promptVersionNumber ?? 0;
  const nextIsMain = !pin;

  const regenMore = () => {
    // one fresh run per model — from each model's newest run as the template
    models.forEach(({ runs }) => {
      const newest = [...runs].sort(
        (a, b) => +new Date(b.session.createdAt) - +new Date(a.session.createdAt),
      )[0];
      regen.mutate(
        { sessionId: newest.session.id, data: { model: null, promptVersionId: pinnedVersionId } },
        { onSuccess: invalidate },
      );
    });
    toast.success("Regenerating…");
  };

  const addModel = (model: string | null) => {
    if (!model || !latest) return;
    regen.mutate(
      { sessionId: latest.session.id, data: { model, promptVersionId: pinnedVersionId } },
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
            <VersionBadge number={nextNumber} isMain={nextIsMain} small />
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
  const { promptVersions } = useWorkspace();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const copyEvent = usePostApiResultsResultIdCopy();
  const deleteRun = useDeleteApiGenerationSessionsSessionId();
  const [copied, setCopied] = useState(false);
  const dot = providerDot(model);
  const pinnedVersionId = promptVersions[promptId]?.versionId ?? null;

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
      invalidatePath(qc, `/api/scripts/${scriptId}/sessions`, `/api/scripts/${scriptId}/tray`);
      // Refresh the scripts list (SessionCount) without sweeping the shared canvas-layout query.
      qc.invalidateQueries({ queryKey: getGetApiScriptsQueryKey() });
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
      { sessionId: newest.session.id, data: { model: null, promptVersionId: pinnedVersionId } },
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
              <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5 text-[10px] text-faint">
                <span className="flex items-center gap-1.5">
                  {displayed.length > 1 && (
                    <span className="font-semibold tracking-wide uppercase">
                      {i === 0 ? "Latest" : `Run ${displayed.length - i}`}
                    </span>
                  )}
                  <VersionBadge
                    number={run.session.promptVersionNumber}
                    isMain={run.session.isMainVersion}
                    small
                  />
                </span>
                {displayed.length > 1 && <span>{formatRelative(run.session.createdAt)}</span>}
              </div>
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
  const { promptVersions } = useWorkspace();
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
      {
        sessionId: run.session.id,
        // Pinned version for this prompt, else null = its current main (always the latest).
        data: { model: null, promptVersionId: promptVersions[run.session.promptId]?.versionId ?? null },
      },
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
        // w-0 min-w-full: render at the card's width but contribute 0 to its max-content, so an
        // expanded (full-text) row wraps instead of widening the card past the 100-char probe.
        "w-0 min-w-full overflow-hidden rounded-[10px] border border-border bg-card transition-[color,background-color,border-color,opacity]",
        isFav && "border-primary bg-primary/[0.06]",
        isHi && "ring-1 ring-rose-400/60",
        open && "border-border-strong",
        dimmed && "opacity-30 hover:opacity-100",
      )}
    >
      <div
        // data-no-drag: this row toggles expand on click — without it the canvas drag handler captures
        // the pointer (setPointerCapture) and the click never reaches onClick, so the card won't expand.
        data-no-drag
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
