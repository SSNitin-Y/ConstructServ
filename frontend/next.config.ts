import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL; 
// e.g. https://rukmer-backend-xxxx-uc.a.run.app (stable service URL)

const nextConfig: NextConfig = {
  output: "standalone",

  async rewrites() {
    if (!BACKEND_URL) return [];

    return [
      // FastAPI routes
      { source: "/media/:path*", destination: `${BACKEND_URL}/media/:path*` },
      { source: "/jobs/:path*", destination: `${BACKEND_URL}/jobs/:path*` },
      { source: "/ai/:path*", destination: `${BACKEND_URL}/ai/:path*` },
      { source: "/conversations/:path*", destination: `${BACKEND_URL}/conversations/:path*` },

      // Optional health checks
      { source: "/health", destination: `${BACKEND_URL}/health` },
      { source: "/db-health", destination: `${BACKEND_URL}/db-health` },
    ];
  },
};

export default nextConfig;
