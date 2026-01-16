/**
 * API route authentication helper
 *
 * Provides utilities for handling authentication in API routes
 * based on the current storage mode.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getStorageMode, getAuthenticatedStorage, getStorageProvider } from '@/lib/storage';
import { prisma } from '@/lib/prisma';
import type { StorageProvider } from '@/lib/storage';

/**
 * Result of authentication check
 */
export type AuthResult =
  | { success: true; storage: StorageProvider; userId: string | null; csvDataPath?: string | null }
  | { success: false; response: NextResponse };

/**
 * Get storage provider for an API request
 *
 * - In local/online mode: Returns storage directly (no auth required)
 * - In database mode: Checks authentication and returns user-scoped storage
 *
 * @returns Auth result with storage provider or error response
 */
export async function getApiStorage(): Promise<AuthResult> {
  const mode = getStorageMode();

  // Local/online mode - no auth required
  if (mode !== 'database') {
    return {
      success: true,
      storage: getStorageProvider(),
      userId: null,
    };
  }

  // Database mode - auth required
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

  // Fetch user's settings to get their CSV data path
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  const csvDataPath = userSettings?.csvDataPath || null;

  return {
    success: true,
    storage: getAuthenticatedStorage(session.user.id, csvDataPath),
    userId: session.user.id,
    csvDataPath,
  };
}

/**
 * Check if the current request is authenticated (for database mode)
 * Returns null if no auth required or if authenticated
 * Returns error response if auth required but not authenticated
 */
export async function requireAuth(): Promise<NextResponse | null> {
  const mode = getStorageMode();

  if (mode !== 'database') {
    return null;
  }

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
 * Returns null if no auth required (local/online mode) or if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const mode = getStorageMode();

  if (mode !== 'database') {
    return null;
  }

  const session = await auth();
  return session?.user?.id || null;
}
