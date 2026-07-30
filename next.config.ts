import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb', // لدعم رفع ملفات حتى 50MB
      ...(process.env.NEXT_PUBLIC_ALLOWED_ORIGINS
        ? { allowedOrigins: process.env.NEXT_PUBLIC_ALLOWED_ORIGINS.split(',') }
        : {}),
    },
  },
  env: {
    NEXT_TELEMETRY_DISABLED: '1',
  },
  // السماح بتحميل الصور من أي مصدر (لصور WhatsApp من Evolution)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default nextConfig;
