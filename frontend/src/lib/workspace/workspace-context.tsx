"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type CenterView = "columns" | "grid" | "map";

type WorkspaceValue = {
  /** The script whose generation history fills the center map. */
  activeScriptId: string | null;
  setActiveScriptId: (id: string | null) => void;

  /** Prompts chosen for the next run (right panel multi-select). */
  selectedPromptIds: string[];
  togglePrompt: (id: string) => void;
  clearPrompts: () => void;

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

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
  const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>([]);
  const [batchScriptIds, setBatchScriptIds] = useState<string[]>([]);
  const [runModels, setRunModels] = useState<string[]>([]);
  const [view, setView] = useState<CenterView>("map");

  const togglePrompt = useCallback(
    (id: string) =>
      setSelectedPromptIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    [],
  );
  const clearPrompts = useCallback(() => setSelectedPromptIds([]), []);

  const toggleBatchScript = useCallback(
    (id: string) =>
      setBatchScriptIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    [],
  );
  const clearBatch = useCallback(() => setBatchScriptIds([]), []);

  const pruneScripts = useCallback((existingIds: string[]) => {
    const set = new Set(existingIds);
    setBatchScriptIds((p) => (p.every((id) => set.has(id)) ? p : p.filter((id) => set.has(id))));
    setActiveScriptId((a) => (a && !set.has(a) ? null : a));
  }, []);

  const toggleRunModel = useCallback(
    (m: string) => setRunModels((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m])),
    [],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        activeScriptId,
        setActiveScriptId,
        selectedPromptIds,
        togglePrompt,
        clearPrompts,
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
