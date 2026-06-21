"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useGetApiActivityUsersUserIdProfile } from "@/api/endpoints/activity/activity";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_RANK: Record<string, number> = { Owner: 0, Admin: 1, Member: 2 };
const topRole = (roles: string[]) =>
  [...roles].sort((a, b) => (ROLE_RANK[a] ?? 9) - (ROLE_RANK[b] ?? 9))[0] ?? "Member";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { isPrivileged } = useAuth();
  const { data, isLoading } = useGetApiActivityUsersUserIdProfile(id, {
    query: { enabled: isPrivileged && !!id, retry: false },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-7">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/teams" />} variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[22px] font-[650] tracking-tight">Profile</h1>
      </div>

      {!isPrivileged ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13.5px] text-muted-foreground">
          Only an Owner or Admin can view profiles.
        </div>
      ) : isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !data ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13.5px] text-muted-foreground">
          User not found.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
            <Avatar className="size-14">
              <AvatarFallback className="bg-accent text-[16px] text-muted-foreground">
                {initials(data.user.displayName || data.user.email || "U")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[18px] font-[650] tracking-tight">{data.user.displayName}</div>
              <div className="truncate text-[13px] text-muted-foreground">{data.user.email}</div>
            </div>
            <Badge
              variant={topRole(data.roles) === "Member" ? "secondary" : "default"}
              className={cn("gap-1", topRole(data.roles) === "Owner" && "bg-primary text-primary-foreground")}
            >
              {topRole(data.roles) === "Owner" && <ShieldCheck className="size-3" />}
              {topRole(data.roles)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="API spend" value={`$${(data.stats.totalCostUsd ?? 0).toFixed(4)}`} accent />
            <Stat label="Generations" value={String(data.stats.generationCount)} />
            <Stat label="Tokens used" value={data.stats.totalTokens.toLocaleString()} />
            <Stat label="Copies" value={String(data.stats.copyCount)} />
            <Stat label="Saved to tray" value={String(data.stats.favoriteCount)} />
            <Stat label="Failed runs" value={String(data.stats.failedCount)} />
            <Stat
              label="Last active"
              value={data.stats.lastActiveAt ? formatRelative(data.stats.lastActiveAt) : "—"}
              wide
            />
          </div>

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

function Stat({ label, value, accent, wide }: { label: string; value: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3.5", wide && "col-span-2")}>
      <div className="text-[11px] tracking-wide text-faint uppercase">{label}</div>
      <div className={cn("mt-1 text-[18px] font-[650] tabular-nums", accent && "text-primary")}>{value}</div>
    </div>
  );
}
