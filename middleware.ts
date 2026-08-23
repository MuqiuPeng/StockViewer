/**
 * Middleware for route protection
 * Only protects routes when STORAGE_MODE is set to 'database'
 * Local mode allows unauthenticated access
 */

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  // Always allow auth routes
  if (pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  // Always allow public API routes (auth endpoints)
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // The data service posts its logs here. It is a server on the same host,
  // not a person with a session, so the session check below would reject it
  // forever — which is what it had been doing, and why no data-service log
  // ever reached the admin view. The route authenticates the caller itself
  // with the shared X-Log-Secret, so exempting it here removes a check that
  // could never pass rather than one that was protecting anything.
  // Same for the scheduled-update endpoint: a scheduler has no session
  // either, and its own CRON_SECRET check could never be reached past this
  // one. Both routes authenticate their caller themselves.
  if (
    pathname === '/api/admin/logs/ingest/service' ||
    pathname.startsWith('/api/cron/')
  ) {
    return NextResponse.next();
  }

  // Always allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if auth is required (database mode)
  const storageMode = process.env.NEXT_PUBLIC_STORAGE_MODE;
  const requireAuth = storageMode === 'database';

  // If auth not required, allow all requests
  if (!requireAuth) {
    return NextResponse.next();
  }

  // If auth required but user not authenticated
  if (!req.auth) {
    const isApiRoute = pathname.startsWith('/api');

    // Return 401 for API routes
    if (isApiRoute) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Redirect to sign in for page routes
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Check user status - only allow APPROVED users (or admin)
  const userStatus = req.auth.user?.status;

  // Admin users bypass approval check
  const isAdmin = req.auth.user?.isAdmin === true;

  // Allow pending approval page for non-approved users
  if (pathname === '/auth/pending') {
    return NextResponse.next();
  }

  // If user is not approved and not admin, redirect to pending page or return 403
  if (userStatus !== 'APPROVED' && !isAdmin) {
    const isApiRoute = pathname.startsWith('/api');

    if (isApiRoute) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Account pending approval' },
        { status: 403 }
      );
    }

    // Redirect to pending approval page
    return NextResponse.redirect(new URL('/auth/pending', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
