import { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate every query whose key starts with any of the given URL paths.
 * orval keys queries by their URL as the first key element, so this matches
 * `/api/scripts`, `/api/scripts/{id}/sessions`, etc. without importing per-endpoint helpers.
 */
export function invalidatePath(qc: QueryClient, ...paths: string[]) {
  return qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey?.[0];
      return typeof k === "string" && paths.some((p) => k.startsWith(p));
    },
  });
}
