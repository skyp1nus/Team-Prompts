/** Provider + dot-colour helpers for OpenRouter model ids (e.g. "openai/gpt-5"). */

export function providerOf(id: string): string {
  const p = (id.split("/")[0] ?? "").toLowerCase();
  if (p.includes("openai")) return "OpenAI";
  if (p.includes("anthropic")) return "Anthropic";
  if (p.includes("google")) return "Google";
  if (p.includes("meta") || p.includes("llama")) return "Meta";
  if (p.includes("mistral")) return "Mistral";
  if (p.includes("deepseek")) return "DeepSeek";
  if (p.includes("x-ai") || p.includes("xai")) return "xAI";
  return p ? p[0].toUpperCase() + p.slice(1) : "Other";
}

/** Matches the design's PROV_DOT palette. */
export const PROVIDER_DOT: Record<string, string> = {
  OpenAI: "#2ea067",
  Anthropic: "#c98a1a",
  Google: "#2a7fd6",
  Meta: "#7b5bd6",
  Mistral: "#c43b54",
  DeepSeek: "#2a7fd6",
  xAI: "#52525b",
};

export function providerDot(id: string): string {
  return PROVIDER_DOT[providerOf(id)] ?? "var(--faint)";
}
