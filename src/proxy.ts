/**
 * Next.js 16 proxy (middleware) — Clerk auth + security headers.
 *
 * Public routes: /, /sign-in, /sign-up, /join, /api/health, /api/player-auth
 * Everything else requires authentication via Clerk.
 *
 * In Next.js 16, middleware.ts was renamed to proxy.ts:
 *   - Export: proxy() instead of middleware()
 *   - Config: proxyConfig instead of config
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/join(.*)',
  '/setup(.*)',
  '/api/health(.*)',
  '/api/player-auth(.*)',
  '/api/programs',
  '/api/auto-analyze',
  '/dev',
  '/_next(.*)',
]);

export const proxy = clerkMiddleware(async (auth, request) => {
  // Security headers on every response
  const headers = new Headers();
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const proxyConfig = {
  matcher: [
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ttf)$).*)',
  ],
};
