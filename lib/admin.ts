/**
 * Admin authentication helper
 *
 * Admin rights live in the User table. The previous super-admin-by-GitHub-ID
 * mechanism went away together with GitHub OAuth; a super admin is now simply
 * a row with isSuperAdmin set, which the seed script grants to the first
 * account (see scripts/create-admin.ts).
 */

import { prisma } from '@/lib/prisma';

/**
 * Check if a user is an admin.
 * Super admins are admins implicitly, whatever isAdmin says.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, isSuperAdmin: true },
  });

  if (!user) {
    return false;
  }

  return user.isAdmin || user.isSuperAdmin;
}

/**
 * Check if a user is a super admin.
 * Super admins cannot have their admin status revoked.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });

  return user?.isSuperAdmin ?? false;
}

/**
 * Get the super admin's user ID.
 * Returns null when no super admin has been created yet.
 */
export async function getAdminUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  return user?.id ?? null;
}
