import type { ScriptDto } from "@/api/model";
import { AXIOS_INSTANCE } from "@/lib/api/axios-instance";
import { MOCK, mockUpload } from "@/lib/api/mock";

/**
 * Hand-written multipart upload — the generated client models IFormFile poorly,
 * so we post FormData directly through the shared axios instance.
 */
export async function uploadScript(file: File, name?: string): Promise<ScriptDto> {
  if (MOCK) return mockUpload(file, name);
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  const { data } = await AXIOS_INSTANCE.post<ScriptDto>("/api/scripts", form);
  return data;
}
