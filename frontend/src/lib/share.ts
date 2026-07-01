/** Deep-link sharing for the Scripts rail: a project's link opens the app focused on that one
 *  project (its space) with all others hidden. Read on load by SharedProjectLoader. */

/** Query-string key that carries the project id on a share link (e.g. `/?project=<id>`). */
export const SHARE_PROJECT_PARAM = "project";

/** Absolute, pasteable link that opens the app focused on this project. Client-only (reads
 *  `window.location.origin`), so call it from event handlers / effects — never during SSR. */
export function projectShareUrl(projectId: string): string {
  return `${window.location.origin}/?${SHARE_PROJECT_PARAM}=${encodeURIComponent(projectId)}`;
}
