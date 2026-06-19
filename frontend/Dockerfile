# Build context is ./frontend
# Next.js (App Router) built and served with Bun, using output: 'standalone'.
# syntax=docker/dockerfile:1

# --- Dependencies stage ---------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app
# Copy manifest(s) first for cached installs. bun.lock may not exist yet;
# the glob keeps the COPY working whether or not a lockfile is present.
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# --- Build stage ----------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined at build time. Empty = same origin behind Caddy
# (OpenAPI paths already include /api). Override via the compose build arg for split origins.
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# --- Runtime stage --------------------------------------------------------
FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output already contains a minimal server.js plus the traced
# node_modules. Copy it to the workdir root, then layer static assets on top.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000

# server.js lives at the root after copying .next/standalone above.
CMD ["bun", "server.js"]
