"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, ScrollText, Settings, UserCircle, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { usePostApiAuthLogout } from "@/api/endpoints/auth/auth";
import { CollapsedRail } from "@/components/collapsed-rail";
import { CenterPanel } from "@/components/generation/center-panel";
import { PromptsPanel } from "@/components/prompts/prompts-panel";
import { GlobalDropZone } from "@/components/scripts/global-drop-zone";
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
import { WorkspaceDock } from "@/components/workspace/workspace-dock";
import { useAuth } from "@/lib/auth/auth-context";
import { initials } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export function AppShell() {
  const { user, isOwner, isAdmin, isPromptEditor, isMember, isPrivileged, canGenerate } = useAuth();
  // Viewer is read-only: no Prompts rail (not even names) and no upload drop-zone.
  const showPrompts = canGenerate;
  const roleLabel = isOwner
    ? "Owner"
    : isAdmin
      ? "Admin"
      : isPromptEditor
        ? "Prompt Editor"
        : isMember
          ? "Member"
          : "Viewer";
  const router = useRouter();
  const qc = useQueryClient();
  const logout = usePostApiAuthLogout();

  const {
    scriptsPanelCollapsed,
    setScriptsPanelCollapsed,
    promptsPanelCollapsed,
    setPromptsPanelCollapsed,
  } = useWorkspace();

  // Imperative handles drive the actual collapse; the persisted booleans above are the source of
  // truth. The effects below reconcile the panel to the boolean (covers reload-restore too), and
  // onResize feeds drag-to-collapse back into the boolean so the toggle + edge tab stay in sync.
  const scriptsRef = useRef<PanelImperativeHandle | null>(null);
  const promptsRef = useRef<PanelImperativeHandle | null>(null);

  useEffect(() => {
    const r = scriptsRef.current;
    if (!r) return;
    if (scriptsPanelCollapsed && !r.isCollapsed()) r.collapse();
    else if (!scriptsPanelCollapsed && r.isCollapsed()) r.expand();
  }, [scriptsPanelCollapsed]);

  useEffect(() => {
    const r = promptsRef.current;
    if (!r) return;
    if (promptsPanelCollapsed && !r.isCollapsed()) r.collapse();
    else if (!promptsPanelCollapsed && r.isCollapsed()) r.expand();
  }, [promptsPanelCollapsed]);

  // Keyboard: ⌘/Ctrl+B toggles Scripts, ⌘/Ctrl+⌥+B toggles Prompts (shadcn-sidebar convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "b" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (e.altKey) setPromptsPanelCollapsed(!promptsPanelCollapsed);
      else setScriptsPanelCollapsed(!scriptsPanelCollapsed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    scriptsPanelCollapsed,
    promptsPanelCollapsed,
    setScriptsPanelCollapsed,
    setPromptsPanelCollapsed,
  ]);

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
              <span className="text-[10.5px] text-faint">{roleLabel}</span>
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
              {isPrivileged && (
                <>
                  <DropdownMenuItem render={<Link href={`/users/${user?.id}`} />}>
                    <UserCircle className="mr-2 size-4" /> My profile
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/teams" />}>
                    <Users className="mr-2 size-4" /> Team &amp; Access
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/activity" />}>
                    <ScrollText className="mr-2 size-4" /> Activity Log
                  </DropdownMenuItem>
                </>
              )}
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

      {/* workspace: Dock | Scripts | Center | Prompts.
          Collapsing a side rail drops its panel to width 0 (the in-panel toggle / a drag below
          minSize / ⌘B do this) and swaps in a slim CollapsedRail in its place — click it to expand.
          Handles adjacent to a collapsed panel are dropped so no stray drag-line lingers. */}
      <div className="flex min-h-0 flex-1">
        <WorkspaceDock />
        {scriptsPanelCollapsed && (
          <CollapsedRail side="left" label="Scripts" onExpand={() => setScriptsPanelCollapsed(false)} />
        )}

        {/* v4: bare numbers are PIXELS. Design rail widths 266 / 304, center flexes. */}
        <ResizablePanelGroup orientation="horizontal" className="h-full flex-1">
          <ResizablePanel
            id="scripts"
            collapsible
            collapsedSize={0}
            panelRef={scriptsRef}
            onResize={(size) => setScriptsPanelCollapsed(size.inPixels < 1)}
            defaultSize={266}
            minSize={220}
            maxSize={360}
          >
            <ScriptsPanel />
          </ResizablePanel>
          {!scriptsPanelCollapsed && <ResizableHandle />}
          <ResizablePanel id="center" minSize={400}>
            <CenterPanel />
          </ResizablePanel>
          {showPrompts && !promptsPanelCollapsed && <ResizableHandle />}
          {showPrompts && (
            <ResizablePanel
              id="prompts"
              collapsible
              collapsedSize={0}
              panelRef={promptsRef}
              onResize={(size) => setPromptsPanelCollapsed(size.inPixels < 1)}
              defaultSize={304}
              minSize={240}
              maxSize={420}
            >
              <PromptsPanel />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>

        {showPrompts && promptsPanelCollapsed && (
          <CollapsedRail side="right" label="Prompts" onExpand={() => setPromptsPanelCollapsed(false)} />
        )}
      </div>

      {/* Upload drop-zone only for those who can upload (Member+). Viewer can't create scripts. */}
      {canGenerate && <GlobalDropZone />}
    </div>
  );
}
