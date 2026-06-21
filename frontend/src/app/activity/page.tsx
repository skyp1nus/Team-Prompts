"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useGetApiActivity } from "@/api/endpoints/activity/activity";
import { useGetApiUsers } from "@/api/endpoints/users/users";
import { type ActivityEventType } from "@/api/model";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTIVITY_META } from "@/lib/activity";
import { useAuth } from "@/lib/auth/auth-context";

const PAGE = 30;
const MAX = 100;

export default function ActivityPage() {
  const { isPrivileged } = useAuth();
  const [userId, setUserId] = useState("all");
  const [type, setType] = useState("all");
  const [take, setTake] = useState(PAGE);

  const { data: users } = useGetApiUsers({ query: { enabled: isPrivileged, retry: false } });
  const { data: feed, isLoading } = useGetApiActivity(
    {
      take,
      userId: userId === "all" ? undefined : userId,
      type: type === "all" ? undefined : (type as ActivityEventType),
    },
    { query: { enabled: isPrivileged } },
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/" />} variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-[22px] font-[650] tracking-tight">Activity Log</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Every generation, copy, prompt change and team action — immutable, click for details.
          </p>
        </div>
      </div>

      {!isPrivileged ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13.5px] text-muted-foreground">
          Only an Owner or Admin can view the activity log.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select value={userId} onValueChange={(v) => v && setUserId(v)}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All members</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.displayName || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => v && setType(v)}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="all">All actions</SelectItem>
                {Object.entries(ACTIVITY_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-faint">
              {isLoading ? "Loading…" : `${feed?.items.length ?? 0} entr${(feed?.items.length ?? 0) === 1 ? "y" : "ies"}`}
            </span>
          </div>

          <div className="rounded-2xl border border-border bg-card px-3 py-1">
            <ActivityFeed events={feed?.items ?? []} />
          </div>

          {feed?.hasMore && take < MAX && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setTake((t) => Math.min(MAX, t + PAGE))}>
                Load more
              </Button>
            </div>
          )}
          {feed?.hasMore && take >= MAX && (
            <p className="text-center text-xs text-faint">Showing the latest {MAX} entries.</p>
          )}
        </>
      )}
    </div>
  );
}
