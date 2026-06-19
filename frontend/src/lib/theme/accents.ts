/**
 * Per-user accent palette (ported from the canonical design's "Tweaks" panel).
 * Picking an accent overrides --primary / --primary-foreground / --ring on
 * <html>, which recolours every primary + primary/opacity ("soft") surface,
 * for both light and dark. Choice is persisted per browser (localStorage).
 */

export type AccentKey =
  | "neutral"
  | "indigo"
  | "ocean"
  | "emerald"
  | "amber"
  | "rose"
  | "slate";

type Tone = { a: string; on: string };

export const ACCENTS: Record<AccentKey, { name: string; light: Tone; dark: Tone }> = {
  neutral: { name: "Neutral", light: { a: "#18181b", on: "#fafafa" }, dark: { a: "#fafafa", on: "#18181b" } },
  indigo: { name: "Indigo", light: { a: "#5b5bd6", on: "#ffffff" }, dark: { a: "#8585f0", on: "#0d0d10" } },
  ocean: { name: "Ocean", light: { a: "#2a7fd6", on: "#ffffff" }, dark: { a: "#5aa6f0", on: "#08111a" } },
  emerald: { name: "Emerald", light: { a: "#1f9d57", on: "#ffffff" }, dark: { a: "#48c98a", on: "#08130c" } },
  amber: { name: "Amber", light: { a: "#c9821a", on: "#ffffff" }, dark: { a: "#e0a93c", on: "#1a1305" } },
  rose: { name: "Rose", light: { a: "#d6455b", on: "#ffffff" }, dark: { a: "#f0708a", on: "#1a0a0d" } },
  slate: { name: "Slate", light: { a: "#5b6472", on: "#ffffff" }, dark: { a: "#9aa6b8", on: "#0d0f12" } },
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];
export const DEFAULT_ACCENT: AccentKey = "neutral";
export const ACCENT_STORAGE_KEY = "tp-accent";

export function isAccentKey(v: string | null): v is AccentKey {
  return !!v && v in ACCENTS;
}

/** Write the accent's CSS variables onto <html> for the current theme. */
export function applyAccent(accent: AccentKey, theme: "light" | "dark") {
  const tone = ACCENTS[accent][theme];
  const s = document.documentElement.style;
  s.setProperty("--primary", tone.a);
  s.setProperty("--primary-foreground", tone.on);
  s.setProperty("--ring", tone.a);
  s.setProperty("--sidebar-primary", tone.a);
  s.setProperty("--sidebar-primary-foreground", tone.on);
  s.setProperty("--sidebar-ring", tone.a);
}
