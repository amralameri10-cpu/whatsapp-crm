import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: process.env.NEXT_PUBLIC_ALLOWED_ORIGINS
        ? process.env.NEXT_PUBLIC_ALLOWED_ORIGINS.split(',')
        : [],
    },
  },
  env: {
    NEXT_TELEMETRY_DISABLED: '1',
  },
};

export default nextConfig;
