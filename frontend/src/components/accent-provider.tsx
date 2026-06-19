"use client";

import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  ACCENT_STORAGE_KEY,
  type AccentKey,
  applyAccent,
  DEFAULT_ACCENT,
  isAccentKey,
} from "@/lib/theme/accents";

type AccentValue = { accent: AccentKey; setAccent: (a: AccentKey) => void };
const AccentContext = createContext<AccentValue | null>(null);

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);

  // load saved choice once
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (isAccentKey(saved)) setAccentState(saved);
    } catch {}
  }, []);

  // (re)apply whenever accent or theme changes
  useEffect(() => {
    applyAccent(accent, resolvedTheme === "dark" ? "dark" : "light");
  }, [accent, resolvedTheme]);

  const setAccent = useCallback((a: AccentKey) => {
    setAccentState(a);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, a);
    } catch {}
  }, []);

  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}

export function useAccent() {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error("useAccent must be used within AccentProvider");
  return ctx;
}
