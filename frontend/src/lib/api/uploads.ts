import type { ScriptDto, ScriptProjectDto, WorkspaceDto } from "@/api/model";
import { AXIOS_INSTANCE } from "@/lib/api/axios-instance";
import { MOCK, mockCreateProject, mockUpload } from "@/lib/api/mock";

/**
 * Hand-written multipart uploads — the generated client models IFormFile poorly,
 * so we post FormData directly through the shared axios instance.
 */
export async function uploadScript(file: File, workspaceId: string, name?: string): Promise<ScriptDto> {
  if (MOCK) return mockUpload(file, workspaceId, name);
  const form = new FormData();
  form.append("workspaceId", workspaceId);
  form.append("file", file);
  if (name) form.append("name", name);
  const { data } = await AXIOS_INSTANCE.post<ScriptDto>("/api/scripts", form);
  return data;
}

/**
 * Upload a file and wrap it in a new project (folder). The file becomes the project's Original
 * script; variants are generated into the project afterwards. Multipart, same IFormFile reason.
 */
export async function createProjectFromUpload(
  file: File,
  workspaceId: string,
  name?: string,
): Promise<ScriptProjectDto> {
  if (MOCK) return mockCreateProject(file, workspaceId, name);
  const form = new FormData();
  form.append("workspaceId", workspaceId);
  form.append("file", file);
  if (name) form.append("name", name);
  const { data } = await AXIOS_INSTANCE.post<ScriptProjectDto>("/api/script-projects", form);
  return data;
}

/**
 * Absolute URL to a script's original uploaded file, served inline so the browser's native viewer
 * renders it (a PDF incl. its review annotations) in a new tab. Same base-URL rule as the axios
 * client (dev: NEXT_PUBLIC_API_BASE_URL; prod: same origin); the same-site cookie authorises it.
 */
export function scriptFileUrl(scriptId: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return `${base}/api/scripts/${scriptId}/file`;
}

/** Upload (or replace) a workspace's dock avatar. Returns the updated workspace. */
export async function uploadWorkspaceAvatar(workspaceId: string, file: File): Promise<WorkspaceDto> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await AXIOS_INSTANCE.post<WorkspaceDto>(`/api/workspaces/${workspaceId}/avatar`, form);
  return data;
}
