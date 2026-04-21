/**
 * Next.js 16 proxy (middleware) — Clerk auth + security headers.
 *
 * DEV MODE: When DEV_BYPASS_AUTH=1, Clerk is completely bypassed —
 * no auth headers, no redirects, nothing. This lets us test the
 * full app without Clerk Organizations or sign-in.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/join(.*)',
  '/api/health(.*)',
  '/api/player-auth(.*)',
  '/api/player-data(.*)',
  '/dev',
  '/_next(.*)',
]);

function devProxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const headers = new Headers();
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

// In dev mode, completely bypass Clerk. Clerk's middleware adds
// x-clerk-auth-reason headers that break non-Clerk flows.
export const proxy = process.env.DEV_BYPASS_AUTH === '1' ? devProxy : clerkProxy;

export const proxyConfig = {
  matcher: [
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ttf)$).*)',
  ],
};
