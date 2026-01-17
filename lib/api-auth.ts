/**
 * API route authentication helper
 *
 * Provides utilities for handling authentication in API routes.
 * All API routes require authentication.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedStorage } from '@/lib/storage';
import type { StorageProvider } from '@/lib/storage';

/**
 * Result of authentication check
 */
export type AuthResult =
  | { success: true; storage: StorageProvider; userId: string }
  | { success: false; response: NextResponse };

/**
 * Get storage provider for an API request
 *
 * Checks authentication and returns user-scoped storage
 *
 * @returns Auth result with storage provider or error response
 */
export async function getApiStorage(): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  return {
    success: true,
    storage: getAuthenticatedStorage(session.user.id),
    userId: session.user.id,
  };
}

/**
 * Check if the current request is authenticated
 * Returns null if authenticated
 * Returns error response if not authenticated
 */
export async function requireAuth(): Promise<NextResponse | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Get the current user ID if authenticated
 * Returns null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id || null;
}
