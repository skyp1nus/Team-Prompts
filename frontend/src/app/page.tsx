"use client";

import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SharedProjectLoader } from "@/components/scripts/shared-project-loader";
import { useAuth } from "@/lib/auth/auth-context";
import { GenerationStreamProvider } from "@/lib/realtime/generation-stream";
import { WorkspaceProvider } from "@/lib/workspace/workspace-context";

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <WorkspaceProvider>
      <GenerationStreamProvider>
        <SharedProjectLoader />
        <AppShell />
      </GenerationStreamProvider>
    </WorkspaceProvider>
  );
}
