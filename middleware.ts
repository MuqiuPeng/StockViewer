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
