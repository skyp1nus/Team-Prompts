import { defineConfig } from "orval";

/**
 * .NET 10's OpenAPI 3.0 writer omits `type` on integer and enum schemas (leaving only
 * `format`/`pattern` or `enum`). orval then types those as `unknown`. This transformer
 * restores the missing `type` in-memory before generation, so the client stays typed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function restoreMissingTypes(node: any): void {
  if (Array.isArray(node)) {
    node.forEach(restoreMissingTypes);
    return;
  }
  if (node && typeof node === "object") {
    if (node.type == null) {
      // .NET emits unsigned ints (e.g. the xmin concurrency token) as uint32/uint64 with a string
      // `pattern` and no `type`; at runtime they serialize as JSON numbers, so treat them as integers.
      if (["int32", "int64", "uint32", "uint64"].includes(node.format)) {
        node.type = "integer";
        delete node.pattern;
      } else if (Array.isArray(node.enum) && node.enum.every((v: unknown) => typeof v === "string")) {
        node.type = "string";
      } else if (node.format === "double" || node.format === "float") {
        node.type = "number";
      }
    }
    for (const key of Object.keys(node)) restoreMissingTypes(node[key]);
  }
}

export default defineConfig({
  teamprompts: {
    input: {
      // The backend emits this; refresh with `bun run gen:api` after API changes.
      target: "../backend/openapi.json",
      override: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transformer: (spec: any) => {
          restoreMissingTypes(spec.components?.schemas ?? {});
          restoreMissingTypes(spec.paths ?? {});
          return spec;
        },
      },
    },
    output: {
      mode: "tags-split",
      target: "src/api/endpoints",
      schemas: "src/api/model",
      client: "react-query",
      httpClient: "axios",
      clean: true,
      override: {
        mutator: {
          path: "src/lib/api/axios-instance.ts",
          name: "customInstance",
        },
        // No `query` override: let orval pick query vs mutation by HTTP method
        // (GET → useQuery, POST/PUT/DELETE → useMutation).
      },
    },
  },
});
