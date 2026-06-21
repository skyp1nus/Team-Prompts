"use client";

import {
  ArrowLeft,
  Clock,
  Copy,
  DollarSign,
  Hash,
  type LucideIcon,
  Sparkles,
  ShieldCheck,
  Star,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useGetApiActivityUsersUserIdProfile } from "@/api/endpoints/activity/activity";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS: { value: string; short: string; label: string; days?: number }[] = [
  { value: "1", short: "24h", label: "the last 24 hours", days: 1 },
  { value: "7", short: "7d", label: "the last 7 days", days: 7 },
  { value: "30", short: "30d", label: "the last 30 days", days: 30 },
  { value: "90", short: "90d", label: "the last 90 days", days: 90 },
  { value: "all", short: "All", label: "all time" },
];

const ROLE_RANK: Record<string, number> = { Owner: 0, Admin: 1, Member: 2 };
const topRole = (roles: string[]) =>
  [...roles].sort((a, b) => (ROLE_RANK[a] ?? 9) - (ROLE_RANK[b] ?? 9))[0] ?? "Member";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { isPrivileged } = useAuth();
  const [period, setPeriod] = useState("all");
  const active = PERIODS.find((p) => p.value === period) ?? PERIODS[4];

  const { data, isLoading } = useGetApiActivityUsersUserIdProfile(
    id,
    active.days != null ? { days: active.days } : undefined,
    { query: { enabled: isPrivileged && !!id, retry: false } },
  );

  const role = data ? topRole(data.roles) : "Member";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-7">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/teams" />} variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[22px] font-[650] tracking-tight">Profile</h1>
      </div>

      {!isPrivileged ? (
        <Gate>Only an Owner or Admin can view profiles.</Gate>
      ) : isLoading ? (
        <>
          <Skeleton className="h-[92px] w-full rounded-2xl" />
          <Skeleton className="h-[120px] w-full rounded-2xl" />
        </>
      ) : !data ? (
        <Gate>User not found.</Gate>
      ) : (
        <>
          {/* identity */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
            <div className="h-12 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent" />
            <div className="flex items-center gap-4 px-5 pb-5">
              <Avatar className="-mt-7 size-16 ring-4 ring-card">
                <AvatarFallback className="bg-accent text-[18px] font-semibold text-muted-foreground">
                  {initials(data.user.displayName || data.user.email || "U")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 pt-1">
                <div className="truncate text-[19px] font-[650] tracking-tight">{data.user.displayName}</div>
                <div className="truncate text-[13px] text-muted-foreground">{data.user.email}</div>
              </div>
              <Badge
                variant={role === "Member" ? "secondary" : "default"}
                className={cn("gap-1", role === "Owner" && "bg-primary text-primary-foreground")}
              >
                {role === "Owner" && <ShieldCheck className="size-3" />}
                {role}
              </Badge>
            </div>
          </div>

          {/* period pills */}
          <div className="flex gap-1 rounded-xl border border-border bg-muted p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  period === p.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.short}
              </button>
            ))}
          </div>

          {/* spend hero */}
          <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.09] to-primary/[0.02] p-5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-primary uppercase">
              <DollarSign className="size-3.5" /> API spend
            </div>
            <div className="mt-2 text-[34px] leading-none font-[680] tracking-tight tabular-nums">
              ${(data.stats.totalCostUsd ?? 0).toFixed(4)}
            </div>
            <div className="mt-2 text-[12px] text-muted-foreground">
              {active.label} · {data.stats.totalTokens.toLocaleString()} tokens · {data.stats.generationCount}{" "}
              generation{data.stats.generationCount === 1 ? "" : "s"}
            </div>
          </div>

          {/* stat grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard icon={Sparkles} tone="ok" label="Generations" value={String(data.stats.generationCount)} />
            <StatCard icon={Hash} tone="primary" label="Tokens used" value={data.stats.totalTokens.toLocaleString()} />
            <StatCard icon={Copy} tone="muted" label="Copies" value={String(data.stats.copyCount)} />
            <StatCard icon={Star} tone="primary" label="Saved to tray" value={String(data.stats.favoriteCount)} />
            <StatCard icon={XCircle} tone="danger" label="Failed runs" value={String(data.stats.failedCount)} />
            <StatCard
              icon={Clock}
              tone="muted"
              label="Last active"
              value={data.stats.lastActiveAt ? formatRelative(data.stats.lastActiveAt) : "—"}
            />
          </div>

          {/* feed */}
          <div>
            <h2 className="eyebrow mb-1 px-1">Recent activity</h2>
            <div className="rounded-2xl border border-border bg-card px-3 py-1">
              <ActivityFeed events={data.recentActivity} showActorLink={false} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  muted: "bg-accent text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  ok: "bg-ok/15 text-ok",
  danger: "bg-destructive/10 text-destructive",
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: keyof typeof TONE;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONE[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[17px] leading-none font-[650] tabular-nums">{value}</div>
        <div className="mt-1 text-[11px] text-faint">{label}</div>
      </div>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13.5px] text-muted-foreground">
      {children}
    </div>
  );
}
