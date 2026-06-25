import type { ScriptDto, WorkspaceDto } from "@/api/model";
import { AXIOS_INSTANCE } from "@/lib/api/axios-instance";
import { MOCK, mockUpload } from "@/lib/api/mock";

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

/** Upload (or replace) a workspace's dock avatar. Returns the updated workspace. */
export async function uploadWorkspaceAvatar(workspaceId: string, file: File): Promise<WorkspaceDto> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await AXIOS_INSTANCE.post<WorkspaceDto>(`/api/workspaces/${workspaceId}/avatar`, form);
  return data;
}
