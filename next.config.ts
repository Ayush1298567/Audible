import type { NextConfig } from 'next';

// Security headers live in `middleware.ts`, not here. Phase 1 will add:
//   X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
// alongside the Clerk middleware, which is the right place for per-request
// response header manipulation in Next.js 16.

const config: NextConfig = {
  // Cache Components (Next.js 16): explicit cache boundaries via `use cache`
  // and cacheLife, replaces the old unstable_cache patterns.
  cacheComponents: true,
  // ffmpeg runs in route handlers via @ffmpeg-installer/ffmpeg; that package
  // ships a binary that Next.js needs to bundle into the server function.
  serverExternalPackages: [
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe',
    'fluent-ffmpeg',
    '@react-pdf/renderer',
  ],
  // Image domains: Vercel Blob public CDN (if we ever use public blobs)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
};

export default config;
