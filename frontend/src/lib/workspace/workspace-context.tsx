"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type CenterView = "columns" | "grid" | "map";

type WorkspaceValue = {
  /** The script whose generation history fills the center map. */
  activeScriptId: string | null;
  setActiveScriptId: (id: string | null) => void;

  /** Prompts chosen for the next run (right panel multi-select). */
  selectedPromptIds: string[];
  togglePrompt: (id: string) => void;
  clearPrompts: () => void;
  /** Drop any selected prompt id that no longer exists. */
  prunePrompts: (existingIds: string[]) => void;

  /** Extra scripts chosen for a batch run (left panel multi-select). */
  batchScriptIds: string[];
  toggleBatchScript: (id: string) => void;
  clearBatch: () => void;
  /** Drop any selected/active script id that no longer exists (e.g. after a delete). */
  pruneScripts: (existingIds: string[]) => void;

  /** Models the next run fans out across (design model picker). Empty → use default. */
  runModels: string[];
  toggleRunModel: (m: string) => void;
  setRunModels: (m: string[]) => void;

  /** Center view mode (Columns / Grid / Map). */
  view: CenterView;
  setView: (v: CenterView) => void;
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
  const [activeScriptId, setActiveScriptId] = usePersistedState<string | null>("tp.ws.activeScript", null);
  const [selectedPromptIds, setSelectedPromptIds] = usePersistedState<string[]>("tp.ws.prompts", []);
  const [batchScriptIds, setBatchScriptIds] = usePersistedState<string[]>("tp.ws.batchScripts", []);
  const [runModels, setRunModels] = usePersistedState<string[]>("tp.ws.runModels", []);
  const [view, setView] = usePersistedState<CenterView>("tp.ws.view", "map");

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
    },
    [setSelectedPromptIds],
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

  return (
    <WorkspaceContext.Provider
      value={{
        activeScriptId,
        setActiveScriptId,
        selectedPromptIds,
        togglePrompt,
        clearPrompts,
        prunePrompts,
        batchScriptIds,
        toggleBatchScript,
        clearBatch,
        pruneScripts,
        runModels,
        toggleRunModel,
        setRunModels,
        view,
        setView,
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
