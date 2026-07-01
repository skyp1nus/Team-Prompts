"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useGetApiScriptProjectsId } from "@/api/endpoints/script-projects/script-projects";
import { SHARE_PROJECT_PARAM } from "@/lib/share";
import { useWorkspace } from "@/lib/workspace/workspace-context";

/**
 * Applies a project share link on load. When the page is opened with `?project=<id>`, this resolves
 * the project, switches to its space and focuses it (rail shows only that project), then strips the
 * param from the URL so a reload/back doesn't re-trigger. Renders nothing.
 *
 * Reads the URL via `window` (not next/navigation) so it stays framework-version agnostic, and only
 * on the client (post-mount) to avoid an SSR/hydration divergence.
 */
export function SharedProjectLoader() {
  const { focusProject } = useWorkspace();
  const [projectId, setProjectId] = useState<string | null>(null);
  const appliedRef = useRef(false);

  // Read the param once, post-mount (client only) — a lazy initializer would touch window during SSR.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(SHARE_PROJECT_PARAM);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount read
    if (id) setProjectId(id);
  }, []);

  const { data, isError } = useGetApiScriptProjectsId(projectId ?? "", {
    query: { enabled: !!projectId },
  });

  useEffect(() => {
    if (!projectId || appliedRef.current) return;

    if (data) {
      appliedRef.current = true;
      focusProject({
        projectId: data.id,
        workspaceId: data.workspaceId,
        originalScriptId: data.originalScriptId,
      });
      stripShareParam();
    } else if (isError) {
      appliedRef.current = true;
      toast.error("Shared project not found");
      stripShareParam();
    }
  }, [projectId, data, isError, focusProject]);

  return null;
}

/** Drop `?project=` from the address bar without a navigation (SPA stays put, no re-trigger). */
function stripShareParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_PROJECT_PARAM);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}
