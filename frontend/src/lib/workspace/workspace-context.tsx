"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type CenterView = "columns" | "grid" | "map";

/** How a model's runs stack inside its output on the Map: vertically (the classic stacked card) or
 *  as a left-to-right, rope-linked chain (newest run extends the chain from the last). Map-only. */
export type MapOrientation = "vertical" | "horizontal";

/** Fixed id of the seeded, non-deletable "General" space (see backend WorkspaceDefaults).
 * Used as the initial active space so the panels can query before the dock list loads. */
export const GENERAL_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

/** A pinned prompt version for the next run. Absence of a pin = follow the prompt's current main
 * version (always the latest the team promoted). <c>number</c> is the "vN" shown in the UI. */
export type PromptVersionPin = { versionId: string; number: number };

type WorkspaceValue = {
  /** The active space (dock selection). Scopes both the Scripts and Prompt Library panels. */
  activeWorkspaceId: string;
  /** Set the active space directly (used for auto-fallback when the persisted id is gone). */
  setActiveWorkspaceId: (id: string) => void;
  /** Switch space from the dock — also clears the previous space's script/prompt selections. */
  selectWorkspace: (id: string) => void;

  /** Dock collapsed (Mac-dock hide). */
  dockCollapsed: boolean;
  toggleDockCollapsed: () => void;

  /** The script whose generation history fills the center map. */
  activeScriptId: string | null;
  setActiveScriptId: (id: string | null) => void;

  /** Prompts chosen for the next run (right panel multi-select). */
  selectedPromptIds: string[];
  togglePrompt: (id: string) => void;
  clearPrompts: () => void;
  /** Drop any selected prompt id that no longer exists. */
  prunePrompts: (existingIds: string[]) => void;

  /** Per-prompt pinned version for the next run. No entry → use the prompt's current main version. */
  promptVersions: Record<string, PromptVersionPin>;
  setPromptVersion: (promptId: string, pin: PromptVersionPin | null) => void;

  /** Extra scripts chosen for a batch run (left panel multi-select). */
  batchScriptIds: string[];
  toggleBatchScript: (id: string) => void;
  clearBatch: () => void;
  /** Drop any selected/active script id that no longer exists (e.g. after a delete). */
  pruneScripts: (existingIds: string[]) => void;

  /** Project folders currently expanded in the Scripts rail. Persisted across reloads. */
  expandedProjectIds: string[];
  toggleProjectExpanded: (id: string) => void;
  setProjectExpanded: (id: string, expanded: boolean) => void;

  /** Models the next run fans out across (design model picker). Empty → use default. */
  runModels: string[];
  toggleRunModel: (m: string) => void;
  setRunModels: (m: string[]) => void;

  /** Center view mode (Columns / Grid / Map). */
  view: CenterView;
  setView: (v: CenterView) => void;

  /** When on, the center emphasizes team highlights and dims everything else. */
  showHighlightsOnly: boolean;
  setShowHighlightsOnly: (v: boolean) => void;

  /** Map-only: stack a model's runs vertically (default) or chain them left-to-right with ropes. */
  mapOrientation: MapOrientation;
  setMapOrientation: (o: MapOrientation) => void;

  /** Left Scripts rail collapsed (hidden) — persisted across reloads. */
  scriptsPanelCollapsed: boolean;
  setScriptsPanelCollapsed: (v: boolean) => void;
  /** Right Prompts rail collapsed (hidden) — persisted across reloads. */
  promptsPanelCollapsed: boolean;
  setPromptsPanelCollapsed: (v: boolean) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** useState that mirrors to localStorage so the selection survives a reload (SSR-safe). */
function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  const skipSave = useRef(true);

  // Load once on mount (client only — avoids hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setState(JSON.parse(raw) as T);
    } catch {
      /* ignore corrupt/unavailable storage */
    }
  }, [key]);

  // Persist on change, skipping the very first run so the initial value never clobbers what was loaded.
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state]);

  return [state, setState];
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkspaceId, setActiveWorkspaceId] = usePersistedState<string>(
    "tp.ws.activeWorkspace",
    GENERAL_WORKSPACE_ID,
  );
  const [dockCollapsed, setDockCollapsed] = usePersistedState<boolean>("tp.ws.dockCollapsed", false);
  const [activeScriptId, setActiveScriptId] = usePersistedState<string | null>("tp.ws.activeScript", null);
  const [selectedPromptIds, setSelectedPromptIds] = usePersistedState<string[]>("tp.ws.prompts", []);
  const [promptVersions, setPromptVersions] = usePersistedState<Record<string, PromptVersionPin>>(
    "tp.ws.promptVersions",
    {},
  );
  const [batchScriptIds, setBatchScriptIds] = usePersistedState<string[]>("tp.ws.batchScripts", []);
  const [expandedProjectIds, setExpandedProjectIds] = usePersistedState<string[]>("tp.ws.expandedProjects", []);
  const [runModels, setRunModels] = usePersistedState<string[]>("tp.ws.runModels", []);
  const [view, setView] = usePersistedState<CenterView>("tp.ws.view", "map");
  const [showHighlightsOnly, setShowHighlightsOnly] = usePersistedState<boolean>("tp.ws.highlightsOnly", false);
  const [mapOrientation, setMapOrientation] = usePersistedState<MapOrientation>("tp.ws.mapOrientation", "vertical");
  const [scriptsPanelCollapsed, setScriptsPanelCollapsed] = usePersistedState<boolean>(
    "tp.ws.scriptsCollapsed",
    false,
  );
  const [promptsPanelCollapsed, setPromptsPanelCollapsed] = usePersistedState<boolean>(
    "tp.ws.promptsCollapsed",
    false,
  );

  // Switching space drops the previous space's selections so stale ids never reach a run or the map.
  // (The dock guards against calling this for the already-active space.)
  const selectWorkspace = useCallback(
    (id: string) => {
      setActiveScriptId(null);
      setBatchScriptIds([]);
      setSelectedPromptIds([]);
      setPromptVersions({});
      setExpandedProjectIds([]);
      setActiveWorkspaceId(id);
    },
    [
      setActiveScriptId,
      setBatchScriptIds,
      setSelectedPromptIds,
      setPromptVersions,
      setExpandedProjectIds,
      setActiveWorkspaceId,
    ],
  );

  const toggleDockCollapsed = useCallback(() => setDockCollapsed((c) => !c), [setDockCollapsed]);

  const togglePrompt = useCallback(
    (id: string) =>
      setSelectedPromptIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    [setSelectedPromptIds],
  );
  const clearPrompts = useCallback(() => setSelectedPromptIds([]), [setSelectedPromptIds]);
  const prunePrompts = useCallback(
    (existingIds: string[]) => {
      const set = new Set(existingIds);
      setSelectedPromptIds((p) => (p.every((id) => set.has(id)) ? p : p.filter((id) => set.has(id))));
      // Drop version pins for prompts that no longer exist.
      setPromptVersions((m) =>
        Object.keys(m).every((id) => set.has(id))
          ? m
          : Object.fromEntries(Object.entries(m).filter(([id]) => set.has(id))),
      );
    },
    [setSelectedPromptIds, setPromptVersions],
  );

  const setPromptVersion = useCallback(
    (promptId: string, pin: PromptVersionPin | null) =>
      setPromptVersions((m) => {
        if (pin === null) {
          if (!(promptId in m)) return m;
          const rest = { ...m };
          delete rest[promptId];
          return rest;
        }
        return { ...m, [promptId]: pin };
      }),
    [setPromptVersions],
  );

  const toggleBatchScript = useCallback(
    (id: string) =>
      setBatchScriptIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    [setBatchScriptIds],
  );
  const clearBatch = useCallback(() => setBatchScriptIds([]), [setBatchScriptIds]);

  const pruneScripts = useCallback(
    (existingIds: string[]) => {
      const set = new Set(existingIds);
      setBatchScriptIds((p) => (p.every((id) => set.has(id)) ? p : p.filter((id) => set.has(id))));
      setActiveScriptId((a) => (a && !set.has(a) ? null : a));
    },
    [setBatchScriptIds, setActiveScriptId],
  );

  const toggleRunModel = useCallback(
    (m: string) => setRunModels((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m])),
    [setRunModels],
  );

  const toggleProjectExpanded = useCallback(
    (id: string) =>
      setExpandedProjectIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    [setExpandedProjectIds],
  );
  const setProjectExpanded = useCallback(
    (id: string, expanded: boolean) =>
      setExpandedProjectIds((p) =>
        expanded ? (p.includes(id) ? p : [...p, id]) : p.filter((x) => x !== id),
      ),
    [setExpandedProjectIds],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspaceId,
        setActiveWorkspaceId,
        selectWorkspace,
        dockCollapsed,
        toggleDockCollapsed,
        activeScriptId,
        setActiveScriptId,
        selectedPromptIds,
        togglePrompt,
        clearPrompts,
        prunePrompts,
        promptVersions,
        setPromptVersion,
        batchScriptIds,
        toggleBatchScript,
        clearBatch,
        pruneScripts,
        expandedProjectIds,
        toggleProjectExpanded,
        setProjectExpanded,
        runModels,
        toggleRunModel,
        setRunModels,
        view,
        setView,
        showHighlightsOnly,
        setShowHighlightsOnly,
        mapOrientation,
        setMapOrientation,
        scriptsPanelCollapsed,
        setScriptsPanelCollapsed,
        promptsPanelCollapsed,
        setPromptsPanelCollapsed,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
