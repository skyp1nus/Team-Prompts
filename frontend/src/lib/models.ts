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

/** Matches the design's PROV_DOT palette, mapped to the theme's --chart-* tokens so the
 *  provider dots follow light/dark. xAI uses --muted-foreground (the design's neutral). */
export const PROVIDER_DOT: Record<string, string> = {
  OpenAI: "var(--chart-2)",
  Anthropic: "var(--chart-1)",
  Google: "var(--chart-3)",
  Meta: "var(--chart-5)",
  Mistral: "var(--chart-4)",
  DeepSeek: "var(--chart-3)",
  xAI: "var(--muted-foreground)",
};

export function providerDot(id: string): string {
  return PROVIDER_DOT[providerOf(id)] ?? "var(--faint)";
}
