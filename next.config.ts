import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    // Turbopack config for Next.js 16+
  },
  // Increase body size limit for multiple image uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Increase API route body size limit for file uploads
  // This applies to Route Handlers in App Router
  serverExternalPackages: [],
};

export default nextConfig;
