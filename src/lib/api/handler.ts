/**
 * Shared API route handler — eliminates the repeated pattern of
 * beginSpan + try/catch + Zod parse + error response across all routes.
 *
 * Usage:
 *   export const POST = apiHandler({
 *     route: '/api/programs',
 *     schema: createProgramSchema, // optional Zod schema for body parsing
 *     handler: async (req, { body, span }) => {
 *       // body is already Zod-validated
 *       const result = await doWork(body);
 *       return Response.json(result, { status: 201 });
 *     },
 *   });
 */

import { beginSpan, type Span } from '@/lib/observability/log';
import { z, type ZodType } from 'zod';

interface ApiHandlerConfig<TBody = unknown> {
  route: string;
  method?: string;
  schema?: ZodType<TBody>;
  handler: (
    req: Request,
    ctx: {
      body: TBody;
      span: Span;
      url: URL;
      searchParams: URLSearchParams;
    },
  ) => Promise<Response>;
}

export function apiHandler<TBody = unknown>(config: ApiHandlerConfig<TBody>) {
  return async (req: Request): Promise<Response> => {
    const span = beginSpan(
      { route: config.route, method: config.method ?? req.method },
      req,
    );

    try {
      const url = new URL(req.url);
      let body: TBody = undefined as TBody;

      // Parse body if schema provided and method supports it
      if (config.schema && req.method !== 'GET' && req.method !== 'HEAD') {
        const rawBody = await req.json();
        body = config.schema.parse(rawBody);
      }

      const response = await config.handler(req, {
        body,
        span,
        url,
        searchParams: url.searchParams,
      });

      span.done();
      return response;
    } catch (error) {
      span.fail(error);

      if (error instanceof z.ZodError) {
        return Response.json(
          { error: 'Validation failed', details: error.issues },
          { status: 400 },
        );
      }

      const message = error instanceof Error ? error.message : 'Internal error';
      return Response.json({ error: message }, { status: 500 });
    }
  };
}

/**
 * Shorthand for GET handlers that just need programId from search params.
 */
export function apiGetHandler(config: {
  route: string;
  handler: (
    req: Request,
    ctx: {
      programId: string;
      span: Span;
      searchParams: URLSearchParams;
    },
  ) => Promise<Response>;
}) {
  return async (req: Request): Promise<Response> => {
    const span = beginSpan({ route: config.route, method: 'GET' }, req);

    try {
      const url = new URL(req.url);
      const programId = url.searchParams.get('programId');

      if (!programId) {
        return Response.json({ error: 'programId required' }, { status: 400 });
      }

      const response = await config.handler(req, {
        programId,
        span,
        searchParams: url.searchParams,
      });

      span.done();
      return response;
    } catch (error) {
      span.fail(error);
      const message = error instanceof Error ? error.message : 'Internal error';
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
