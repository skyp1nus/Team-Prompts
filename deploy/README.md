# Deploy — Team Prompts (shared Hetzner host)

Team Prompts runs as its **own compose stack** in `/opt/team-prompts` on the shared host
(`178.105.189.6`), alongside `hookline`. It owns **no** infrastructure — it borrows the shared
Caddy (`shared-caddy-1`, TLS + routing) and the shared Postgres (`shared-postgres-1`, alias
`postgres`) from `/opt/shared`. No Redis (Hangfire runs on Postgres). No host ports — only the
shared Caddy is published.

```
Internet ─► shared-caddy-1 :443 ─► team-prompts.danielhub.dev ┬─ /api/*,/hangfire* ─► team-prompts-api-1:8080
                                                              └─ everything else   ─► team-prompts-web-1:3000
shared-postgres-1 (alias postgres) ── database: teamprompts (role teamprompts)
```

## Build / release model

GitHub Actions (`.github/workflows/ci.yml`) builds **amd64** images on push to `main` (or a manual
`workflow_dispatch`), pushes them to GHCR (`ghcr.io/skyp1nus/team-prompts/{api,web}`), then deploys:
scp this folder to `/opt/team-prompts`, `docker compose pull && up -d`, install the Caddy site block
into `/opt/shared/sites/`, hot-reload Caddy.

## RAM budget (host is 3.7 GB + 4 GB swap, 2 vCPU)

| Service | mem_limit |
|---|---:|
| shared postgres / redis / caddy | 512m / 128m / 96m |
| hookline backend / frontend | 640m / 320m |
| **team-prompts api / web** | **640m / 320m** |
| Σ caps | 2656m |

Leaves ~1.1 GB for kernel + Docker daemon; real idle ≈ 0.8 GB. `.NET` runs workstation GC
(`DOTNET_gcServer=0`) to keep idle RSS low. No resize needed.

---

## First-time go-live

### 0. DNS (do this first — TLS depends on it)
Add an **A record**: `team-prompts.danielhub.dev` → `178.105.189.6`. Verify:
```sh
dig +short team-prompts.danielhub.dev   # must print 178.105.189.6
```

### 1. Create the database + role in the shared Postgres
The init script only runs on a fresh volume, so create it by hand (use a strong password — the
**same** value goes into `.env` below):
```sh
PW='<generated-db-password>'
docker exec shared-postgres-1 psql -U postgres -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE teamprompts LOGIN PASSWORD '$PW';" \
  -c "CREATE DATABASE teamprompts OWNER teamprompts;"
```

### 2. Provision `/opt/team-prompts/.env`
```sh
sudo mkdir -p /opt/team-prompts && sudo chown deploy:deploy /opt/team-prompts
cd /opt/team-prompts
# create .env from deploy/.env.prod.example, fill ConnectionStrings__Default password
# (= the PW above), Seed__AdminPassword, App__PublicBaseUrl.
```

### 3. Repo secrets (for the deploy job)
```sh
gh secret set DEPLOY_HOST    --repo skyp1nus/Team-Prompts --body "178.105.189.6"
gh secret set DEPLOY_SSH_KEY --repo skyp1nus/Team-Prompts < ~/.ssh/hetzner-den
```

### 4. Ship it
```sh
# push to main, or trigger manually from any branch:
gh workflow run ci.yml --ref <branch>
gh run watch
```

### 5. Verify
```sh
curl -I https://team-prompts.danielhub.dev          # 200/302 + valid TLS
docker ps --format '{{.Names}}\t{{.Status}}'        # team-prompts-{api,web}-1 Up
docker stats --no-stream                            # under mem_limits, total < 4G
```
Then log in as the seed admin and set the **OpenRouter API key** in Settings (write-only, encrypted —
it is intentionally not an env var).

## Notes / gotchas
- **Data Protection key ring** lives on the `team-prompts_dpkeys` volume. Never wipe it — it decrypts
  the stored OpenRouter key and signs the auth cookie; losing it logs everyone out and orphans the key.
- **Routing**: `/api/*` (incl. the SignalR hub `/api/hubs/generation`) and `/hangfire*` go to the API;
  everything else to Next.js. Caddy forwards the WebSocket upgrade transparently.
- **Same-origin**: the web image is built with an empty `NEXT_PUBLIC_API_BASE_URL` (relative `/api/*`).
  A runtime env can't change it — it's inlined at build time.
- **Redeploys**: just push to `main`. `IMAGE_TAG` is pinned to the commit SHA; the Caddy block is
  re-published every run.
