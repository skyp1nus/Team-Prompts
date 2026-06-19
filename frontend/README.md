# Team Prompts — Web

Next.js (App Router) frontend for Team Prompts. **Use [Bun](https://bun.sh) for every command — it is the only supported package manager and runner here.**

## Getting started

```bash
bun install
bun run dev      # dev server on http://localhost:3000
```

## Common commands

```bash
bun run build    # production build
bun run start    # serve the production build
bun run gen:api  # regenerate the API client from the backend OpenAPI doc (orval)
```

## Notes

- Server state goes through the **orval-generated** TanStack Query hooks (`src/api/*`) — never
  hand-write fetch calls. After a backend API change, refresh the contract and run `bun run gen:api`.
- UI is **shadcn/ui**; forms are React Hook Form + Zod on the shadcn `Form` primitives.

See the repo root `CLAUDE.md` for the full stack, conventions, and the API-refresh workflow.
