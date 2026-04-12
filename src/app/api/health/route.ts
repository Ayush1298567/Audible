/**
 * Health check endpoint.
 *
 * Returns 200 with minimal body info when the app is up. Used by:
 *   - Vercel deploy verification
 *   - CI smoke tests in the deploy workflow
 *   - Future uptime monitoring (not in Phase 0)
 *
 * Intentionally does NOT hit the database — a health check that fails
 * when the DB is down turns every DB hiccup into a deploy outage. DB
 * health is checked separately by /api/health/db.
 *
 * This route is the **reference template** for every other route
 * handler in the app. Copy this shape:
 *   1. Begin a span at the top
 *   2. Wrap the work in try / catch / done-or-fail
 *   3. Never let an unhandled throw escape
 *   4. Always return a well-formed Response
 */

import { beginSpan, log } from '@/lib/observability/log';

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/health' }, req);
  const requestId = req.headers.get('x-vercel-id') ?? undefined;

  try {
    const payload = {
      status: 'ok' as const,
      phase: 'phase-0-scaffolding',
      timestamp: new Date().toISOString(),
    };
    span.done({ status: payload.status });
    return Response.json(payload);
  } catch (error) {
    // Health checks should never throw, but if they do, we want the
    // failure in runtime logs so a surprise 500 is debuggable.
    span.fail(error, { requestId });
    log.error('health_check_unexpected_failure', {
      route: '/api/health',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        status: 'error',
        error: 'Internal error',
        requestId,
      },
      { status: 500 },
    );
  }
}
