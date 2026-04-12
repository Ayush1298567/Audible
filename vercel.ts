/**
 * Vercel project configuration (Next.js 16 + vercel.ts).
 *
 * Replaces the legacy vercel.json. Full TypeScript, dynamic logic,
 * and environment variable access.
 *
 * Reference: https://vercel.com/docs/project-configuration/vercel-ts
 */

import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'bun run build',
  installCommand: 'bun install',
  // Long-running video processing lives in queued workers, not the
  // request/response path. Route handlers stay under 30s. The
  // ingestion workflow spawned from /api/ingest/* kicks off
  // Vercel Queues jobs and returns immediately.
  functions: {
    'src/app/api/ingest/**/*': {
      maxDuration: 60,
      memory: 1024,
    },
    'src/app/api/cv/**/*': {
      maxDuration: 60,
      memory: 1024,
    },
    'src/app/api/**/*': {
      maxDuration: 30,
      memory: 512,
    },
  },
  // Cron jobs (none in Phase 0; populated during Phase 8+)
  crons: [],
};
