/**
 * Structured logging primitives for route handlers, server actions,
 * and background workers.
 *
 * Every entry is a single-line JSON object so Vercel runtime logs can
 * parse and filter it. The `requestId` field pulls from the
 * `x-vercel-id` header so a single request can be traced across
 * functions and the ingestion/CV workers it triggers.
 *
 * Usage:
 *
 *   const span = beginSpan({ route: '/api/ingest/upload' }, req);
 *   try {
 *     // ...work...
 *     span.done({ playCount: 60 });
 *   } catch (err) {
 *     span.fail(err);
 *     throw err;
 *   }
 *
 * This is the Phase 0 baseline. Sentry gets wired in later for error
 * tracking on top of this; logs always flow through here first.
 *
 * See PLAN.md §5 (observability) and the /vercel-plugin:observability
 * skill guidance.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  route?: string;
  worker?: string;
  programId?: string;
  userId?: string;
  playId?: string;
  filmUploadId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, context: LogContext): void {
  const record = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...context,
  };
  const line = JSON.stringify(record);
  if (level === 'error') {
    // Goes to stderr, picked up by Vercel as error logs
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (msg: string, context: LogContext = {}): void => emit('debug', msg, context),
  info: (msg: string, context: LogContext = {}): void => emit('info', msg, context),
  warn: (msg: string, context: LogContext = {}): void => emit('warn', msg, context),
  error: (msg: string, context: LogContext = {}): void => emit('error', msg, context),
};

export interface Span {
  done: (extra?: Record<string, unknown>) => void;
  fail: (error: unknown, extra?: Record<string, unknown>) => void;
  /**
   * Child span that inherits context from this one. Use when a request
   * hand-offs to a background job and you want both logs to share
   * requestId / programId / etc.
   */
  child: (name: string, extra?: LogContext) => Span;
}

/**
 * Start a timed span. Emits `msg: 'start'` immediately and returns a
 * handle you call `.done()` or `.fail()` on. Duration is measured
 * from the call to `beginSpan` to the call to `done/fail`.
 */
export function beginSpan(context: LogContext, req?: Request | null): Span {
  const start = Date.now();
  const requestId = req?.headers.get('x-vercel-id') ?? undefined;
  const base: LogContext = { ...context, requestId };

  log.info('start', base);

  const makeSpan = (baseContext: LogContext, baseStart: number): Span => ({
    done: (extra) => {
      log.info('done', {
        ...baseContext,
        ...extra,
        durationMs: Date.now() - baseStart,
      });
    },
    fail: (error, extra) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      log.error('failed', {
        ...baseContext,
        ...extra,
        error: errorMessage,
        stack: errorStack,
        durationMs: Date.now() - baseStart,
      });
    },
    child: (name, extra) =>
      makeSpan(
        { ...baseContext, ...extra, parent: baseContext.route ?? baseContext.worker, child: name },
        Date.now(),
      ),
  });

  return makeSpan(base, start);
}

/**
 * Fire-and-forget metric emission. Pair with `waitUntil` from
 * `@vercel/functions` to send telemetry after the response has
 * returned to the user.
 */
export function emitMetric(
  name: string,
  value: number,
  tags: Record<string, string | number | boolean> = {},
): void {
  log.info('metric', {
    metric: name,
    value,
    tags,
  });
}
