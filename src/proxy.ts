/**
 * Next.js proxy (Next.js 16+, formerly middleware.ts).
 *
 * Runs on every request before routing. Phase 0 responsibilities:
 *   1. Attach security headers to every response
 *
 * Phase 1 will replace this file with Clerk's auth proxy wrapped
 * in a matcher that distinguishes coach routes, player routes, and
 * public routes. See PLAN.md §5.1.
 *
 * Next.js 16 renamed middleware.ts → proxy.ts:
 *   - File:     middleware.ts     → proxy.ts
 *   - Function: middleware()      → proxy()
 *   - Config:   config            → proxyConfig
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

export function proxy(_req: NextRequest): NextResponse {
  const response = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const proxyConfig = {
  matcher: [
    // Run on all routes except static assets and Next.js internals.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
