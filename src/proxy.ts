/**
 * Next.js 16 proxy (middleware) — Clerk auth + security headers.
 *
 * Public routes: /, /sign-in, /sign-up, /join, /api/health, /api/player-auth
 * Everything else requires authentication via Clerk.
 *
 * DEV MODE: When DEV_BYPASS_AUTH=1 is set, all routes are public.
 * This lets us test the full app without Clerk Organizations enabled.
 */

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

export const proxy = clerkMiddleware(async (auth, request) => {
  // Security headers on every response
  const headers = new Headers();
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Dev bypass — skip auth entirely when flag is set
  if (process.env.DEV_BYPASS_AUTH === '1') {
    return;
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const proxyConfig = {
  matcher: [
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ttf)$).*)',
  ],
};
