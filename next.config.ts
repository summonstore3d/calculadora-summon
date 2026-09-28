import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.VERCEL
    ? {
        turbopack: {
          resolveAlias: {
            "cloudflare:workers": "./lib/vercel-cloudflare-shim.ts",
          },
        },
      }
    : {}),
};

export default nextConfig;
