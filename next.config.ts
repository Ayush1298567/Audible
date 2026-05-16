import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const config: NextConfig = {
  // Cache Components (Next.js 16): explicit cache boundaries via `use cache`
  // and cacheLife, replaces the old unstable_cache patterns.
  cacheComponents: true,
  // The developer machine has a package-lock higher in the home directory.
  // Pin Turbopack to this app so CSS/import resolution does not climb out of
  // the Audible workspace and Next stops warning about an inferred root.
  turbopack: {
    root: process.cwd(),
  },
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

// Wrap config with Workflow SDK support. This compiles 'use workflow'
// and 'use step' directives into durable routes.
export default withWorkflow(config);
