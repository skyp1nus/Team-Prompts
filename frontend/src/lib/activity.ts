import {
  Copy,
  Crown,
  FileText,
  FileUp,
  GitBranch,
  type LucideIcon,
  LogIn,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { ActivityEventType } from "@/api/model";

type Tone = "muted" | "primary" | "ok" | "danger";

export const ACTIVITY_META: Record<ActivityEventType, { label: string; icon: LucideIcon; tone: Tone }> = {
  [ActivityEventType.UserLoggedIn]: { label: "Signed in", icon: LogIn, tone: "muted" },
  [ActivityEventType.UserCreated]: { label: "Created a user", icon: UserPlus, tone: "primary" },
  [ActivityEventType.ScriptUploaded]: { label: "Uploaded a script", icon: FileUp, tone: "primary" },
  [ActivityEventType.ScriptDeleted]: { label: "Deleted a script", icon: Trash2, tone: "danger" },
  [ActivityEventType.PromptCreated]: { label: "Created a prompt", icon: FileText, tone: "primary" },
  [ActivityEventType.PromptDeleted]: { label: "Deleted a prompt", icon: Trash2, tone: "danger" },
  [ActivityEventType.PromptVersionCreated]: { label: "Added a prompt version", icon: GitBranch, tone: "muted" },
  [ActivityEventType.PromptVersionPromoted]: { label: "Promoted a version", icon: Crown, tone: "primary" },
  [ActivityEventType.GenerationStarted]: { label: "Started a generation", icon: Sparkles, tone: "muted" },
  [ActivityEventType.GenerationCompleted]: { label: "Generated", icon: Sparkles, tone: "ok" },
  [ActivityEventType.GenerationFailed]: { label: "Generation failed", icon: XCircle, tone: "danger" },
  [ActivityEventType.ResultCopied]: { label: "Copied a result", icon: Copy, tone: "muted" },
  [ActivityEventType.ResultFavorited]: { label: "Saved to tray", icon: Star, tone: "primary" },
  [ActivityEventType.ResultUnfavorited]: { label: "Removed from tray", icon: Star, tone: "muted" },
};

export const TONE_CLASS: Record<Tone, string> = {
  muted: "bg-accent text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  ok: "bg-ok/15 text-ok",
  danger: "bg-destructive/10 text-destructive",
};

/** USD cost: "Free" for 0, more decimals for tiny amounts. */
export function formatCost(c: number | null | undefined): string {
  if (c == null) return "—";
  if (c === 0) return "Free";
  return `$${c < 0.01 ? c.toFixed(5) : c.toFixed(4)}`;
}

/** Pretty-print the stored metadata JSON; "" when empty. */
export function prettyMetadata(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw);
    if (!obj || Object.keys(obj).length === 0) return "";
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw;
  }
}
