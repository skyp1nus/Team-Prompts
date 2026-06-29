"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  Copy,
  FileText,
  Heart,
  Loader2,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  RotateCw,
  Rows3,
  SlidersHorizontal,
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
import { usePostApiScriptProjectsIdSummaryRegenerate } from "@/api/endpoints/script-projects/script-projects";
import {
  getGetApiScriptsIdCanvasQueryKey,
  getGetApiScriptsQueryKey,
  useDeleteApiScriptsIdCanvas,
  useGetApiScriptsIdCanvas,
  usePutApiScriptsIdCanvas,
} from "@/api/endpoints/scripts/scripts";
import { SessionStatus, type CanvasNodeDto, type GenerationResultDto, type ScriptDto, type SessionWithResultsDto, type UserRef } from "@/api/model";
import { AddModelMenu } from "@/components/generation/add-model-menu";
import { VersionBadge } from "@/components/generation/version-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRelative, modelLabel } from "@/lib/format";
import { providerDot, providerOf } from "@/lib/models";
import { invalidatePath } from "@/lib/query/invalidate";
import { useGenerationStream } from "@/lib/realtime/generation-stream";
import { cn } from "@/lib/utils";
import { type MapOrientation, useWorkspace } from "@/lib/workspace/workspace-context";

export type Group = {
  promptId: string;
  promptName: string;
  sessions: SessionWithResultsDto[];
  /** "summary" = a summary-tagged prompt's lane (ran against the Summary script — the Summary branch);
   *  "main" = a normal lane off the Original. Drives the always-first ordering + the lane's SUMMARY tag. */
  segment: "summary" | "main";
};

const MIN_Z = 0.3;
const MAX_Z = 2.5;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, +z.toFixed(3)));

/** How many characters a collapsed result row should fit before truncating. */
const PREVIEW_MAX = 100;

/** Refresh everything a run/output delete affects: the script's sessions + tray, the scripts list's
 *  session counts, and the canvas layout. Shared by the per-run and whole-output delete paths so they
 *  can't drift. The scripts-list invalidation is targeted (not the shared canvas-layout query). */
function invalidateAfterRunDelete(qc: QueryClient, scriptId: string, onLayoutChange: () => void) {
  invalidatePath(qc, `/api/scripts/${scriptId}/sessions`, `/api/scripts/${scriptId}/tray`);
  qc.invalidateQueries({ queryKey: getGetApiScriptsQueryKey() });
  onLayoutChange();
}

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
  | { key: string; kind: "summary" }
  | { key: string; kind: "prompt"; group: Group }
  | {
      key: string;
      kind: "col";
      group: Group;
      colId: string;
      model: string;
      runs: SessionWithResultsDto[];
    };

/** Colour of the Summary node → its tagged prompts (the branch edges). */
const SUMMARY_EDGE_COLOR = "#8b5cf6"; // violet-500
const SUMMARY_W = 380;

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
const summaryKeyFor = (scriptId: string) => `summary:${scriptId}`;

function flattenNodes(groups: Group[], summaryKey: string | null): FlatNode[] {
  const out: FlatNode[] = [];
  // The Summary node anchors the branch — render/measure it first so its edges to the tagged prompts route.
  if (summaryKey) out.push({ key: summaryKey, kind: "summary" });
  for (const g of groups) {
    out.push({ key: promptKey(g.promptId), kind: "prompt", group: g });
    for (const mg of groupModels(g.sessions)) {
      const colId = `${g.promptId}::${mg.model}`;
      out.push({ key: colNodeKey(colId), kind: "col", group: g, colId, model: mg.model, runs: mg.runs });
    }
  }
  return out;
}

/** Lay out one prompt lane (prompt card on the left, its model outputs stacked to the right) at the
 *  given top-left, returning the bottom Y after the lane + gap. */
function placeLane(
  grid: Record<string, XY>,
  g: Group,
  x: number,
  y: number,
  sizeOf: (k: string) => { w: number; h: number },
): number {
  const pKey = promptKey(g.promptId);
  const pSize = sizeOf(pKey);
  grid[pKey] = { x, y };
  const colX = x + (pSize.w || PROMPT_W) + COL_GAP_X;
  let cy = y;
  for (const mg of groupModels(g.sessions)) {
    const cKey = colNodeKey(`${g.promptId}::${mg.model}`);
    grid[cKey] = { x: colX, y: cy };
    cy += sizeOf(cKey).h + COL_GAP_Y;
  }
  const stacked = cy - COL_GAP_Y - y;
  return y + Math.max(pSize.h, stacked, 0) + LANE_GAP_Y;
}

/** Deterministic default grid (used only for blocks with no saved/known position). The Summary node sits
 *  top-LEFT; its dependent lanes branch to the RIGHT (each a normal prompt → output, left-to-right) so the
 *  flow reads Summary → prompt → output. Main lanes stack below at the normal left margin. */
function computeAutoGrid(
  groups: Group[],
  sizeOf: (k: string) => { w: number; h: number },
  summaryKey: string | null,
): Record<string, XY> {
  const grid: Record<string, XY> = {};
  let summaryBottom = PAD_Y;
  let branchX = PAD_X;
  if (summaryKey) {
    grid[summaryKey] = { x: PAD_X, y: PAD_Y };
    const sSize = sizeOf(summaryKey);
    summaryBottom = PAD_Y + sSize.h;
    branchX = PAD_X + (sSize.w || SUMMARY_W) + COL_GAP_X;
  }

  // Dependent (Summary-related) lanes branch to the RIGHT of the Summary node, stacked from the top.
  let by = PAD_Y;
  const summaryGroups = groups.filter((g) => g.segment === "summary");
  for (const g of summaryGroups) by = placeLane(grid, g, branchX, by, sizeOf);

  // Main lanes below the whole Summary block, back at the normal left margin.
  const branchActive = summaryKey || summaryGroups.length > 0;
  let my = branchActive ? Math.max(summaryBottom, by - LANE_GAP_Y) + LANE_GAP_Y : PAD_Y;
  for (const g of groups.filter((g) => g.segment !== "summary")) my = placeLane(grid, g, PAD_X, my, sizeOf);

  return grid;
}

/**
 * Free-form node map (design "Team Prompts - Map (shadcn)"). Each block — a prompt lane on the left
 * and one output card per model on the right — is absolutely positioned and can be dragged anywhere,
 * Figma-style. Positions are saved per script and shared with the whole team (auto-layout is only the
 * starting arrangement). Provider-coloured bezier edges re-route to follow blocks as they move.
 */
export function MapView({
  groups,
  scriptId,
  summary,
  projectId,
}: {
  groups: Group[];
  scriptId: string;
  /** The project's Summary script (the mind-map anchor node), or null when none exists yet. */
  summary: ScriptDto | null;
  projectId: string | null;
}) {
  const qc = useQueryClient();
  const { mapOrientation, setMapOrientation, showHighlightsOnly, setShowHighlightsOnly } = useWorkspace();
  const summaryKey = summary ? summaryKeyFor(scriptId) : null;
  const [menuOpen, setMenuOpen] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const tRef = useRef<Transform>({ z: 0.8, tx: 40, ty: 28 });
  const initedRef = useRef(false);
  const panningRef = useRef(false);

  const [t, setT] = useState<Transform>({ z: 0.8, tx: 40, ty: 28 });
  const [layoutVersion, setLayoutVersion] = useState(0);
  // Bumps on any block resize — first measurement, streamed token, expand/collapse, viewport resize.
  // The placement pass depends on it so auto-placed lanes re-stack off real measured heights (a run
  // added below an existing block never overlaps); the layer bbox + edges follow too.
  const [sizeTick, setSizeTick] = useState(0);
  const [hover, setHover] = useState<Hover>(null);
  const [edges, setEdges] = useState<Edge[]>([]);

  /* ---- canvas positions (shared, persisted) ---- */
  const { data: savedNodes } = useGetApiScriptsIdCanvas(scriptId, { query: { enabled: !!scriptId } });
  const saveCanvas = usePutApiScriptsIdCanvas();
  const resetCanvas = useDeleteApiScriptsIdCanvas();

  const nodes = useMemo(() => flattenNodes(groups, summaryKey), [groups, summaryKey]);
  const nodeKeys = useMemo(() => nodes.map((n) => n.key), [nodes]);
  // The ordered prompt-id sequence (lane order) is part of the structure: reordering prompts in the
  // right panel must reflow the canvas lanes, not only adding/removing a block. Prepending it makes
  // the placement effect re-run on a pure reorder even if the *set* of node keys is unchanged.
  const promptSeq = useMemo(() => groups.map((g) => g.promptId).join(">"), [groups]);
  const structuralKey = useMemo(() => `${promptSeq}#${nodeKeys.join("|")}`, [promptSeq, nodeKeys]);
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

  /* Re-measure when a block's own content grows/shrinks (first paint, live token streaming, expanding
     a result) — not just on viewport resize — so the placement pass, edges and the layer bbox all keep
     following the block. */
  useEffect(() => {
    const ro = new ResizeObserver(() => setSizeTick((s) => s + 1));
    nodeRoRef.current = ro;
    for (const el of nodeEls.current.values()) ro.observe(el);
    return () => {
      ro.disconnect();
      nodeRoRef.current = null;
    };
  }, []);
  /** Measure a block in layer coordinates (screen size ÷ current zoom). Before a block is in the DOM
   *  we can't measure it, so estimate a height generous enough that the auto lane below never seeds on
   *  top of it; the real height arrives via the ResizeObserver (`sizeTick`) and reflows the lane. */
  const sizeOf = useCallback((key: string) => {
    const el = nodeEls.current.get(key);
    const z = tRef.current.z || 1;
    if (!el) return { w: PROMPT_W, h: 220 };
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
     grid and reflows whenever that order, the block set, OR a block's measured height changes — so a
     run added below an existing block always re-stacks the lane below it instead of overlapping. An
     actively-dragged block is left alone. `setPos` short-circuits when nothing moved, so this stays
     cheap; auto lanes shift down as content grows (incl. streaming) precisely to avoid overlap, while
     manual placements never move. */
  useLayoutEffect(() => {
    if (!canvasReady) return;
    setPos((prev) => {
      const keySet = new Set(nodeKeys);
      const grid = computeAutoGrid(groups, sizeOf, summaryKey);
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
    // Re-run on:
    //  • structuralKey  — lanes reorder / a block is added or removed
    //  • serverPos      — a teammate's manual placement arrives
    //  • mapOrientation — tall stack ↔ wide chain rewrites every footprint
    //  • layoutVersion  — an explicit layout change (generate-more, delete a run, expand a result)
    //  • sizeTick       — any block was measured / grew / shrank (incl. first paint + streaming); auto
    //                     lanes re-stack off real heights so the lane below a growing block never ends
    //                     up underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, structuralKey, serverPos, sizeOf, mapOrientation, layoutVersion, sizeTick]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bbox is measured from the DOM after layout; there is no render-time value to derive
    setLayerSize((ls) => (ls.w === nw && ls.h === nh ? ls : { w: nw, h: nh }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, ready, structuralKey, sizeOf, layoutVersion, sizeTick, mapOrientation]);

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
      // eslint-disable-next-line react-hooks/immutability -- d is dragRef.current (a mutable ref); the gesture flag must not trigger a re-render
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
    // eslint-disable-next-line react-hooks/immutability -- clearing the drag-gesture ref; refs are mutable by design
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
          setPos(computeAutoGrid(groups, sizeOf, summaryKey));
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

    // Summary node → each dependent prompt (the chain flowing rightward OUT of the Summary).
    const summaryRoot = layer.querySelector<HTMLElement>("[data-summary]");
    const sCard = summaryRoot?.querySelector<HTMLElement>("[data-card]");
    if (sCard) {
      const sr = sCard.getBoundingClientRect();
      const ax = (sr.right - base.left) / z; // Summary node RIGHT (source)
      const ay = (sr.top + sr.height / 2 - base.top) / z;
      layer.querySelectorAll<HTMLElement>('[data-prompt][data-segment="summary"]').forEach((pr) => {
        const pid = pr.dataset.prompt!;
        const card = pr.querySelector<HTMLElement>("[data-card]");
        if (!card) return;
        const cr = card.getBoundingClientRect();
        const bx = (cr.left - base.left) / z; // dependent prompt LEFT (target)
        const by = (cr.top + cr.height / 2 - base.top) / z;
        const dx = Math.max(60, Math.abs(bx - ax) * 0.5);
        next.push({
          key: `summary__${pid}`,
          promptId: pid,
          colId: "",
          color: SUMMARY_EDGE_COLOR,
          ax,
          ay,
          bx,
          by,
          d: `M${ax} ${ay} C${ax + dx} ${ay} ${bx - dx} ${by} ${bx} ${by}`,
        });
      });
    }
    setEdges(next);
  }, [structuralKey, layoutVersion, sizeTick, pos, layerSize.w, layerSize.h, mapOrientation]);

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
    if (n.kind === "summary") return false;
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
              {n.kind === "summary" ? (
                <SummaryNode summary={summary!} projectId={projectId} scriptId={scriptId} />
              ) : n.kind === "prompt" ? (
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
                  orientation={mapOrientation}
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

      {/* collapsible canvas controls (orientation · highlights · zoom · layout) */}
      <MapMenu
        open={menuOpen}
        onToggleOpen={() => setMenuOpen((o) => !o)}
        orientation={mapOrientation}
        onOrientation={setMapOrientation}
        highlightsOnly={showHighlightsOnly}
        onToggleHighlights={() => setShowHighlightsOnly(!showHighlightsOnly)}
        zoomPct={Math.round(t.z * 100)}
        onZoomOut={() => zoomCenter(1 / 1.6)}
        onZoomIn={() => zoomCenter(1.6)}
        onZoomReset={() =>
          zoomAt(1, (viewportRef.current?.clientWidth ?? 0) / 2, (viewportRef.current?.clientHeight ?? 0) / 2)
        }
        onFit={fit}
        onResetLayout={onResetLayout}
        resetPending={resetCanvas.isPending}
      />
    </div>
  );
}

/* ============================ MAP MENU ============================ */
/** Collapsible bottom-right control cluster: layout orientation, the team highlights spotlight, zoom,
 *  fit, and reset-layout — folded behind one button so the canvas stays clear. */
function MapMenu({
  open,
  onToggleOpen,
  orientation,
  onOrientation,
  highlightsOnly,
  onToggleHighlights,
  zoomPct,
  onZoomOut,
  onZoomIn,
  onZoomReset,
  onFit,
  onResetLayout,
  resetPending,
}: {
  open: boolean;
  onToggleOpen: () => void;
  orientation: MapOrientation;
  onOrientation: (o: MapOrientation) => void;
  highlightsOnly: boolean;
  onToggleHighlights: () => void;
  zoomPct: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onResetLayout: () => void;
  resetPending: boolean;
}) {
  if (!open) {
    return (
      <div className="absolute right-4 bottom-4 z-20">
        <button
          onClick={onToggleOpen}
          title="Canvas controls"
          aria-label="Open canvas controls"
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
        >
          <SlidersHorizontal className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute right-4 bottom-4 z-20 w-[212px] rounded-xl border border-border bg-card p-2 shadow-md">
      <div className="mb-2 flex items-center justify-between pr-0.5 pl-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Canvas</span>
        <button
          onClick={onToggleOpen}
          title="Collapse controls"
          aria-label="Collapse canvas controls"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      {/* orientation — how a model's runs stack */}
      <div className="flex gap-0.5 rounded-lg border border-border bg-muted p-[3px]">
        <SegBtn active={orientation === "vertical"} onClick={() => onOrientation("vertical")}>
          <Rows3 className="size-3.5" /> Stacked
        </SegBtn>
        <SegBtn active={orientation === "horizontal"} onClick={() => onOrientation("horizontal")}>
          <Columns3 className="size-3.5" /> Chain
        </SegBtn>
      </div>

      {/* team highlights spotlight */}
      <button
        onClick={onToggleHighlights}
        title={
          highlightsOnly
            ? "Showing only highlights — click to show every result"
            : "Spotlight the team’s highlights and dim the rest"
        }
        className={cn(
          "mt-2 flex h-8 w-full items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
          highlightsOnly
            ? "border-rose-400/60 bg-rose-500/10 text-rose-600"
            : "border-border text-muted-foreground hover:border-rose-400/50 hover:text-rose-600",
        )}
      >
        <Heart className={cn("size-3.5", highlightsOnly && "fill-current")} />
        Highlights
      </button>

      {/* zoom */}
      <div className="mt-2 flex items-center gap-0.5 rounded-lg border border-border p-1">
        <ZoomBtn onClick={onZoomOut} label="Zoom out">
          <Minus className="size-4" />
        </ZoomBtn>
        <button
          onClick={onZoomReset}
          className="min-w-0 flex-1 rounded-lg px-1 text-xs font-semibold text-foreground tabular-nums transition-colors hover:bg-accent"
          title="Reset to 100%"
        >
          {zoomPct}%
        </button>
        <ZoomBtn onClick={onZoomIn} label="Zoom in">
          <Plus className="size-4" />
        </ZoomBtn>
        <span className="mx-0.5 h-[18px] w-px bg-border" />
        <ZoomBtn onClick={onFit} label="Fit to view">
          <Maximize2 className="size-4" />
        </ZoomBtn>
      </div>

      {/* reset every block back to auto-layout */}
      <button
        onClick={onResetLayout}
        disabled={resetPending}
        title="Tidy every block back into place"
        className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {resetPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        Reset layout
      </button>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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

/* ============================ SUMMARY NODE ============================ */
/** The mind-map anchor block ON the canvas: the project's Summary script. The summary-tagged prompts
 *  branch off it (violet edges flow from here). Carries status, a вижимка preview, and Regenerate. */
function SummaryNode({
  summary,
  projectId,
  scriptId,
}: {
  summary: ScriptDto;
  projectId: string | null;
  scriptId: string;
}) {
  const qc = useQueryClient();
  const regen = usePostApiScriptProjectsIdSummaryRegenerate();
  const [expanded, setExpanded] = useState(false);
  const status = summary.variantStatus as SessionStatus | null | undefined;
  const pending = status === SessionStatus.Queued || status === SessionStatus.Streaming;
  const failed = status === SessionStatus.Failed;
  const text = (summary.extractedText ?? "").trim();

  const regenerate = () => {
    if (!projectId || regen.isPending) return;
    regen.mutate(
      { id: projectId },
      {
        onSuccess: () => {
          invalidatePath(qc, "/api/script-projects", `/api/scripts/${scriptId}/sessions`);
          toast.success("Regenerating the mind map…");
        },
        onError: () => toast.error("Couldn’t regenerate the Summary"),
      },
    );
  };

  return (
    <div data-node data-summary={scriptId} className="relative z-[2] shrink-0" style={{ width: SUMMARY_W }}>
      <div data-card className="relative rounded-[13px] border border-violet-400/50 bg-card shadow-md">
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-violet-500/12 text-violet-600 dark:text-violet-400">
              <Network className="size-[15px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow !text-[9px] tracking-[0.09em]">Mind map</div>
              <div className="truncate text-[15px] leading-tight font-[650] tracking-tight">Summary</div>
            </div>
            <SummaryStatusPill status={status} />
          </div>

          {pending ? (
            <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-[11.5px] text-faint">
              <Loader2 className="size-3.5 animate-spin" /> Building the mind map…
            </div>
          ) : failed ? (
            <div className="mt-3 rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[11.5px] text-destructive">
              {summary.variantError || "Summary generation failed."}
            </div>
          ) : text ? (
            <button
              data-no-drag
              onClick={() => setExpanded((e) => !e)}
              className="mt-3 flex w-full items-start gap-2 rounded-[10px] border border-border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted"
            >
              {expanded ? (
                <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 text-[12px] leading-relaxed whitespace-pre-wrap",
                  !expanded && "line-clamp-3",
                )}
              >
                {text}
              </span>
            </button>
          ) : (
            <p className="mt-3 text-[11.5px] text-faint">No Summary yet.</p>
          )}
        </div>
      </div>

      {/* footer toolbar — model + Regenerate */}
      <div className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border border-border bg-card p-1.5 shadow-sm">
        <span className="flex min-w-0 items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
          <Network className="size-3.5 shrink-0 text-faint" />
          <span className="truncate">{summary.model ? modelLabel(summary.model) : "Summary"}</span>
        </span>
        <span className="flex-1" />
        <button
          onClick={regenerate}
          disabled={regen.isPending || pending || !projectId}
          title="Regenerate the Summary from the master prompt"
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] bg-violet-600 px-2.5 text-[11.5px] font-semibold text-white shadow-sm transition-colors hover:bg-violet-600/90 disabled:opacity-50"
        >
          {regen.isPending || pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
          Regenerate
        </button>
      </div>
    </div>
  );
}

function SummaryStatusPill({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; cls: string }> = {
    [SessionStatus.Queued]: { label: "Queued", cls: "bg-accent text-muted-foreground" },
    [SessionStatus.Streaming]: { label: "Generating", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    [SessionStatus.Completed]: { label: "Ready", cls: "bg-ok/15 text-ok" },
    [SessionStatus.Failed]: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
  };
  const s = status ? map[status] : undefined;
  if (!s) return null;
  return (
    <span className={cn("rounded-[5px] px-1.5 py-px text-[9px] font-bold tracking-wide uppercase", s.cls)}>
      {s.label}
    </span>
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
      data-segment={group.segment}
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
              <div className="flex items-center gap-1.5">
                <div className="eyebrow !text-[9px] tracking-[0.09em]">Prompt</div>
                {group.segment === "summary" && (
                  <span
                    title="Runs against the Summary script — the Summary branch"
                    className="rounded-[4px] bg-violet-500/15 px-1 py-px text-[8px] font-bold tracking-wide text-violet-600 dark:text-violet-400"
                  >
                    ↳ SUMMARY
                  </span>
                )}
              </div>
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
  orientation,
  onHover,
  onLayoutChange,
}: {
  colId: string;
  model: string;
  runs: SessionWithResultsDto[];
  promptId: string;
  scriptId: string;
  lit: boolean;
  orientation: MapOrientation;
  onHover: (hovering: boolean) => void;
  onLayoutChange: () => void;
}) {
  const { live } = useGenerationStream();
  const qc = useQueryClient();
  const { promptVersions } = useWorkspace();
  const { isPrivileged } = useAuth();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const copyEvent = usePostApiResultsResultIdCopy();
  const deleteRun = useDeleteApiGenerationSessionsSessionId();
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dot = providerDot(model);
  const pinnedVersionId = promptVersions[promptId]?.versionId ?? null;

  // Delete this model's whole output — every run/session for it. Confirmed via AlertDialog; the
  // session-delete endpoint is privileged-only (Owner/Admin), so the control is hidden otherwise.
  const removeOutput = async () => {
    const ids = runs.map((r) => r.session.id);
    if (ids.length === 0 || deleteRun.isPending) return;
    const many = ids.length > 1;
    try {
      await Promise.all(ids.map((sessionId) => deleteRun.mutateAsync({ sessionId })));
      toast.success(many ? "Output deleted" : "Run deleted");
    } catch {
      toast.error("Couldn’t delete");
    } finally {
      invalidateAfterRunDelete(qc, scriptId, onLayoutChange);
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

  const statusOf = (r: SessionWithResultsDto) => (live[r.session.id]?.status ?? r.session.status) as string;
  const isActive = (r: SessionWithResultsDto) =>
    statusOf(r) === SessionStatus.Streaming || statusOf(r) === SessionStatus.Queued;
  // Parked, waiting on the Summary to finish — shown as a quiet "waiting" state, never as running.
  const isWaiting = (r: SessionWithResultsDto) => statusOf(r) === SessionStatus.Waiting;
  // Show every run that has results, plus active/waiting runs. A failed/empty run is only shown when it's
  // the very latest attempt — so repeated rate-limited retries don't stack identical blocks.
  const displayed = ordered.filter(
    (run, i) => run.results.length > 0 || isActive(run) || isWaiting(run) || i === 0,
  );
  const anyStreaming = ordered.some(isActive);
  const anyWaiting = ordered.some(isWaiting);

  // Size the card to this block's OWN longest result (capped at PREVIEW_MAX chars), not always to a
  // full 100 — so short-result blocks stay compact. Probe uses the real text for proportional-font
  // accuracy; ties broken by raw length.
  const longestContent = displayed
    .flatMap((run) => run.results)
    .reduce((longest, r) => (r.content.length > longest.length ? r.content : longest), "");
  const probeText = longestContent.slice(0, PREVIEW_MAX);
  // The newest run already shows its own "Try again" when it failed/emptied — so don't double up
  // with the header's generate button in that case.
  const newestFailed =
    !!ordered[0] && !isActive(ordered[0]) && !isWaiting(ordered[0]) && ordered[0].results.length === 0;

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
      {orientation === "horizontal" ? (
        /* Chain layout: each run is its own card laid left-to-right (oldest → newest), linked by a
           rope from the previous one — a new run extends the chain from the last. Results inside a
           single run stay stacked; only the runs themselves chain. */
        <div className="relative flex flex-row items-start gap-10">
          <ChainRope ids={displayed.map((r) => r.session.id).join("|")} color={dot} />
          {[...displayed].reverse().map((run, j, arr) => {
            const isLatest = run.session.id === ordered[0]?.session.id;
            const multi = arr.length > 1;
            return (
              <RunCard
                key={run.session.id}
                run={run}
                scriptId={scriptId}
                onLayoutChange={onLayoutChange}
                lit={lit}
                // The prompt → output edge anchors to the left-most (first) card in the chain.
                anchor={j === 0}
                label={multi ? (isLatest ? "Latest" : `Run ${j + 1}`) : ""}
                time={multi ? formatRelative(run.session.createdAt) : ""}
                canDeleteRun={multi}
              />
            );
          })}
        </div>
      ) : (
        /* fn-card — stacked results body */
        <div
          data-card
          className={cn(
            "rounded-[13px] border border-border bg-card shadow-md transition-[box-shadow,border-color]",
            lit && "border-border-strong shadow-lg",
          )}
        >
          <div className="flex flex-col gap-1.5 p-2.5">
            <WidthProbe text={probeText} />
            {displayed.map((run, i) => (
              <div key={run.session.id} className={cn(i > 0 && "mt-1 border-t border-border pt-2.5")}>
                <RunMeta
                  label={displayed.length > 1 ? (i === 0 ? "Latest" : `Run ${displayed.length - i}`) : ""}
                  time={displayed.length > 1 ? formatRelative(run.session.createdAt) : ""}
                  number={run.session.promptVersionNumber}
                  isMain={run.session.isMainVersion}
                />
                <RunBlock
                  run={run}
                  scriptId={scriptId}
                  onLayoutChange={onLayoutChange}
                  canDeleteRun={displayed.length > 1}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* fn-bar — model + actions */}
      <div className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border border-border bg-card p-1.5 shadow-sm">
        <span className="flex min-w-0 items-center gap-2 px-1.5 text-[12px] font-medium">
          <span className="size-[7px] shrink-0 rounded-full" style={{ background: dot }} />
          <span className="min-w-0 truncate">{modelLabel(model)}</span>
          <span className="shrink-0 text-[10px] text-faint">{providerOf(model)}</span>
        </span>
        <span className="flex-1" />
        {/* Whole-output delete — privileged-only (matches the Owner/Admin-gated delete endpoint). */}
        {isPrivileged && (
          <>
            <button
              onClick={() => setConfirmOpen(true)}
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
            <DeleteConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              pending={deleteRun.isPending}
              title={runs.length > 1 ? "Delete this output?" : "Delete this run?"}
              description={
                runs.length > 1
                  ? `This deletes the ${modelLabel(model)} output and all ${runs.length} runs. This can’t be undone.`
                  : "This deletes the run and its results. This can’t be undone."
              }
              onConfirm={removeOutput}
            />
          </>
        )}
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
            disabled={regen.isPending || anyStreaming || anyWaiting}
            title="Generate more"
            aria-label="Generate more"
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
          >
            {anyStreaming || regen.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {anyStreaming ? "Running" : anyWaiting ? "Waiting" : "Generate"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Invisible sizer: makes a card exactly wide enough for its longest result (≤ PREVIEW_MAX chars),
 *  mirroring the real collapsed row EXACTLY — chevron + text + count + BOTH action buttons (highlight
 *  + favourite) — so the card is sized to the real text and `truncate` never clips a ≤100-char title
 *  mid-card. Any element here that the real row has but the probe lacks shrinks the card and clips text
 *  early, so keep the two layouts in lockstep. */
function WidthProbe({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div aria-hidden className="pointer-events-none h-0 overflow-hidden" data-width-probe>
      <div className="flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2">
        <span className="size-3.5 shrink-0" />
        <span className="text-[12.5px] leading-snug font-medium whitespace-nowrap">{text}</span>
        <span className="shrink-0 text-[10px] tabular-nums">000</span>
        <span className="size-[22px] shrink-0" />
        <span className="size-[22px] shrink-0" />
      </div>
    </div>
  );
}

/** Run header: "Latest / Run N" label (when there's more than one run) + version badge + relative time. */
function RunMeta({
  label,
  time,
  number,
  isMain,
}: {
  label: string;
  time: string;
  number: number;
  isMain: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5 text-[10px] text-faint">
      <span className="flex items-center gap-1.5">
        {label && <span className="font-semibold tracking-wide uppercase">{label}</span>}
        <VersionBadge number={number} isMain={isMain} small />
      </span>
      {time && <span>{time}</span>}
    </div>
  );
}

/** One run as a standalone card for the horizontal chain layout — its own border, meta and width
 *  sizer, so runs read as separate, rope-linked blocks rather than one tall stack. */
function RunCard({
  run,
  scriptId,
  onLayoutChange,
  lit,
  anchor,
  label,
  time,
  canDeleteRun,
}: {
  run: SessionWithResultsDto;
  scriptId: string;
  onLayoutChange: () => void;
  lit: boolean;
  /** The chain's left-most card — carries `data-card` so the prompt edge connects here. */
  anchor: boolean;
  label: string;
  time: string;
  canDeleteRun: boolean;
}) {
  const probeText = useMemo(() => {
    const longest = run.results.reduce((l, r) => (r.content.length > l.length ? r.content : l), "");
    return longest.slice(0, PREVIEW_MAX);
  }, [run.results]);
  return (
    <div
      data-run-card
      data-card={anchor ? "" : undefined}
      className={cn(
        "relative z-[1] w-fit shrink-0 rounded-[13px] border border-border bg-card p-2.5 shadow-md transition-[box-shadow,border-color]",
        lit && "border-border-strong shadow-lg",
      )}
    >
      <RunMeta label={label} time={time} number={run.session.promptVersionNumber} isMain={run.session.isMainVersion} />
      <WidthProbe text={probeText} />
      <RunBlock run={run} scriptId={scriptId} onLayoutChange={onLayoutChange} canDeleteRun={canDeleteRun} />
    </div>
  );
}

/** The rope linking the horizontal run chain: a provider-coloured bezier from each run card's
 *  right-middle to the next card's left-middle (same style as the prompt → output edges). Geometry
 *  is read from card offsets — unaffected by the canvas zoom transform — and re-measured on resize.
 *  The row is found via the svg's own parentElement (not a passed ref) because a child effect runs
 *  before the parent's ref is attached, so a parent ref would still be null here. */
function ChainRope({ ids, color }: { ids: string; color: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<{ key: string; d: string; ax: number; ay: number; bx: number; by: number }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const row = svgRef.current?.parentElement;
    if (!row) return;
    const recompute = () => {
      const cards = [...row.querySelectorAll<HTMLElement>("[data-run-card]")];
      const next: { key: string; d: string; ax: number; ay: number; bx: number; by: number }[] = [];
      for (let i = 0; i < cards.length - 1; i++) {
        const a = cards[i];
        const b = cards[i + 1];
        const ax = a.offsetLeft + a.offsetWidth;
        const ay = a.offsetTop + a.offsetHeight / 2;
        const bx = b.offsetLeft;
        const by = b.offsetTop + b.offsetHeight / 2;
        const dx = Math.max(20, (bx - ax) * 0.5);
        next.push({ key: `${i}`, d: `M${ax} ${ay} C${ax + dx} ${ay} ${bx - dx} ${by} ${bx} ${by}`, ax, ay, bx, by });
      }
      setPaths(next);
      setSize({ w: row.scrollWidth, h: row.scrollHeight });
    };
    recompute();
    // Follow the cards as they grow (streaming tokens, expanding a result) or as runs are added.
    const ro = new ResizeObserver(recompute);
    ro.observe(row);
    for (const c of row.querySelectorAll("[data-run-card]")) ro.observe(c);
    return () => ro.disconnect();
  }, [ids]);

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      style={{ width: size.w, height: size.h, zIndex: 0 }}
    >
      {paths.map((p) => (
        <g key={p.key}>
          <path d={p.d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <circle cx={p.ax} cy={p.ay} r={3.4} fill={color} />
          <circle cx={p.bx} cy={p.by} r={3.4} fill={color} />
        </g>
      ))}
    </svg>
  );
}

/** One generation run inside an output card: its live stream, results, or failed state + retry. */
function RunBlock({
  run,
  scriptId,
  onLayoutChange,
  // Only offer the per-run delete when the output has more than one run. For a single-run output the
  // OutputNode header's whole-output delete already covers it, so a per-run button would just be a
  // duplicate control deleting the same session.
  canDeleteRun = false,
}: {
  run: SessionWithResultsDto;
  scriptId: string;
  onLayoutChange: () => void;
  canDeleteRun?: boolean;
}) {
  const { live } = useGenerationStream();
  const qc = useQueryClient();
  const { promptVersions } = useWorkspace();
  const { isPrivileged } = useAuth();
  const regen = usePostApiGenerationSessionsSessionIdRegenerate();
  const deleteRun = useDeleteApiGenerationSessionsSessionId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ls = live[run.session.id];
  const status = (ls?.status ?? run.session.status) as string;
  const streaming = status === SessionStatus.Streaming || status === SessionStatus.Queued;
  const waiting = status === SessionStatus.Waiting;
  const failed = status === SessionStatus.Failed;
  const error = (ls?.error ?? run.session.error) ?? null;
  const rateLimited = !!error && error.includes("429");

  // Delete just THIS run (one GenerationSession). Privileged-only (Owner/Admin), matching the
  // session-delete endpoint's policy; mirrors the whole-output delete's invalidation.
  const removeRun = async () => {
    if (deleteRun.isPending) return;
    try {
      await deleteRun.mutateAsync({ sessionId: run.session.id });
      toast.success("Run deleted");
    } catch {
      toast.error("Couldn’t delete");
    } finally {
      invalidateAfterRunDelete(qc, scriptId, onLayoutChange);
    }
  };

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
      {waiting && <WaitingRow />}
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
      {!streaming && !waiting && results.length === 0 && (
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
      {/* Per-run delete — removes just this one session. Privileged-only (Owner/Admin), matching
          the session-delete endpoint's policy. Hidden while streaming, and only shown when the
          output has more than one run (otherwise the header's whole-output delete already covers it). */}
      {isPrivileged && canDeleteRun && !streaming && (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={deleteRun.isPending}
              title="Delete this run"
              aria-label="Delete this run"
              className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              {deleteRun.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </button>
          </div>
          <DeleteConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            pending={deleteRun.isPending}
            title="Delete this run?"
            description="This deletes the run and its results. This can’t be undone."
            onConfirm={removeRun}
          />
        </>
      )}
    </div>
  );
}

/** Shared confirm dialog for destructive run/output deletes. Controlled so the trigger can live on a
 *  separate toolbar button; runs `onConfirm` then closes. */
function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  pending: boolean;
  title: string;
  description: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async (e) => {
              // Run the delete, then close ourselves (AlertDialogAction doesn't auto-close).
              e.preventDefault();
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StreamingRow() {
  return (
    <div className="flex animate-pulse items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-[11.5px] text-faint">
      <Loader2 className="size-3.5 animate-spin" /> generating variants…
    </div>
  );
}

/** A summary-dependent run parked until the Summary finishes — a quiet "waiting" state, not a spinner. */
function WaitingRow() {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-violet-400/50 bg-violet-500/[0.04] px-3 py-2.5 text-[11.5px] text-violet-600 dark:text-violet-400">
      <Clock className="size-3.5" /> Waiting for the Summary…
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

  // Collapsed rows show at most PREVIEW_MAX (100) chars, ellipsised past that; the card is sized to the
  // ACTUAL text (via WidthProbe), so short titles stay compact instead of reserving a 100-char block.
  const isTruncated = result.content.length > PREVIEW_MAX;
  const preview = isTruncated ? `${result.content.slice(0, PREVIEW_MAX)}…` : result.content;

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
        {!open && isTruncated ? (
          // Collapsed + over 100 chars: show the ellipsised preview with a tooltip carrying the full
          // title. The tooltip only exists when the text is actually truncated.
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="min-w-0 flex-1 truncate text-[12.5px] leading-snug font-medium">
                  {preview}
                </span>
              }
            />
            <TooltipContent side="top" className="max-w-sm whitespace-normal">
              {result.content}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={cn("min-w-0 flex-1 text-[12.5px] leading-snug font-medium", !open && "truncate")}>
            {open ? result.content : preview}
          </span>
        )}
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
