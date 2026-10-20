import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Self-contained server bundle for the Docker image (Render). Ignored by Vercel.
  output: "standalone",
  poweredByHeader: false,
  // Pin the workspace root so a lockfile in a parent folder cannot change where standalone output lands.
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ dev: process.env.NODE_ENV !== "production" }) }];
  },
};

export default nextConfig;
