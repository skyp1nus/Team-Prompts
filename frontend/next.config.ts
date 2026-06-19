import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal production server for the Docker image (infra Dockerfile copies .next/standalone).
  output: "standalone",
  // Pin the workspace root (a stray lockfile in $HOME otherwise confuses Turbopack).
  turbopack: { root: __dirname },
};

export default nextConfig;
