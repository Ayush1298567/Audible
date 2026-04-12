/**
 * Next.js 16 instrumentation — runs once per server process on startup.
 *
 * This is the right place to initialize:
 *   - Error tracking (Sentry) — wired in during Phase 10 polish
 *   - OpenTelemetry exporters — wired in when we add Drains (Phase 10)
 *   - DB connection pool warmup (not needed with serverless Neon)
 *   - Any module-level one-time setup
 *
 * For now, Phase 0 just emits a startup log line so we can see in
 * Vercel runtime logs when a new function instance comes up. This
 * makes cold starts visible and debuggable from day one.
 *
 * Reference:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import { log } from '@/lib/observability/log';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    log.info('instrumentation_start', {
      phase: 'phase-0-scaffolding',
      nodeVersion: process.version,
      runtime: process.env.NEXT_RUNTIME,
      region: process.env.VERCEL_REGION ?? 'local',
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    });
  }
}
