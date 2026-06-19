"use client";

import { ArrowLeft, Lock, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVITY_TYPES,
  memberInitials,
  SEED_ACTIVITY,
  SEED_MEMBERS,
} from "@/lib/demo/team-data";
import { cn } from "@/lib/utils";

export default function ActivityPage() {
  const [q, setQ] = useState("");
  const [member, setMember] = useState("all");
  const [type, setType] = useState("all");

  const ql = q.toLowerCase();
  const rows = SEED_ACTIVITY.filter((a) => {
    if (member !== "all" && a.who !== member) return false;
    if (type !== "all" && a.tag !== type) return false;
    if (ql && !`${a.who} ${a.what} ${a.target} ${a.detail}`.toLowerCase().includes(ql)) return false;
    return true;
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/" />} variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-[22px] font-[650] tracking-tight">Activity Log</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Every generation, prompt change, and team action — who, what, and when.
          </p>
        </div>
      </div>

      <Alert>
        <Lock className="size-4" />
        <AlertDescription>
          Visible to Owner &amp; Admin only · you are viewing as <b className="text-foreground">Owner</b>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search activity…"
            className="h-9 pl-[30px]"
          />
        </div>
        <Select value={member} onValueChange={(v) => v && setMember(v)}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All members</SelectItem>
            {SEED_MEMBERS.map((m) => (
              <SelectItem key={m.id} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => v && setType(v)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "all" ? "All actions" : t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-faint">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <div className="ml-1.5 border-l border-border pl-0">
        {rows.length === 0 ? (
          <p className="py-5 pl-6 text-[13px] text-faint">No activity matches these filters.</p>
        ) : (
          rows.map((a) => (
            <div key={a.id} className="relative flex gap-3.5 pb-[22px] pl-[26px]">
              <span
                className={cn(
                  "absolute top-[3px] left-[-5px] size-[9px] rounded-full border-2",
                  a.accent ? "border-primary bg-primary" : "border-border-strong bg-background",
                )}
              />
              <Avatar className="size-6">
                <AvatarFallback className="bg-accent text-[10px] text-muted-foreground">
                  {memberInitials(a.who)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-snug">
                  <span className="mr-2 inline-block rounded-[5px] bg-accent px-1.5 py-px align-[1px] text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {a.tag}
                  </span>
                  <b className="font-semibold">{a.who}</b> {a.what} <b className="font-semibold">{a.target}</b>
                </div>
                <div className="mt-0.5 text-xs text-faint">{a.detail}</div>
              </div>
              <div className="shrink-0 text-[11.5px] whitespace-nowrap text-faint">{a.when}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
