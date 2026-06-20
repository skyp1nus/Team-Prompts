"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, ScrollText, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePostApiAuthLogout } from "@/api/endpoints/auth/auth";
import { CenterPanel } from "@/components/generation/center-panel";
import { PromptsPanel } from "@/components/prompts/prompts-panel";
import { ScriptsPanel } from "@/components/scripts/scripts-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useAuth } from "@/lib/auth/auth-context";
import { initials } from "@/lib/format";

export function AppShell() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const logout = usePostApiAuthLogout();

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        // Drop all cached data so `user` is undefined immediately — otherwise the stale
        // /api/auth/me cache bounces us back from /login until a refetch/reload lands.
        qc.clear();
        router.replace("/login");
      },
    });

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* topbar */}
      <header className="z-20 flex h-[52px] shrink-0 items-center gap-[18px] border-b border-border bg-background px-[18px]">
        <div className="flex items-center gap-2.5">
          <div className="flex size-[22px] items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
            T
          </div>
          <b className="text-sm font-semibold tracking-tight">Team Prompts</b>
        </div>
        <nav className="flex gap-0.5">
          <span className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[13px] font-medium text-foreground">
            Workspace
          </span>
        </nav>

        <div className="flex-1" />

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="ml-1.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-1 transition-colors hover:bg-accent aria-expanded:bg-accent" />
            }
          >
            <Avatar className="size-[27px]">
              <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                {initials(user?.displayName ?? "?")}
              </AvatarFallback>
            </Avatar>
            <span className="flex flex-col text-left leading-tight">
              <span className="text-[12.5px] font-medium">{user?.displayName}</span>
              <span className="text-[10.5px] text-faint">{isAdmin ? "Admin" : "Member"}</span>
            </span>
            <ChevronDown className="size-3 text-faint" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[236px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-[13px] font-semibold">{user?.displayName}</span>
                <span className="text-[11px] font-normal text-faint">{user?.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[10px] font-semibold tracking-wide text-faint uppercase">
                Manage
              </DropdownMenuLabel>
              <DropdownMenuItem render={<Link href="/teams" />}>
                <Users className="mr-2 size-4" /> Teams
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/activity" />}>
                <ScrollText className="mr-2 size-4" /> Activity Log
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <Settings className="mr-2 size-4" /> Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="mr-2 size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* workspace: Scripts | Center | Prompts */}
      <div className="min-h-0 flex-1">
        {/* v4: bare numbers are PIXELS. Design rail widths 266 / 304, center flexes. */}
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize={266} minSize={220} maxSize={360}>
            <ScriptsPanel />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={400}>
            <CenterPanel />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={304} minSize={240} maxSize={420}>
            <PromptsPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
