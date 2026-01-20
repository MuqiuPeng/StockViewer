/**
 * Admin authentication helper
 */

import { prisma } from '@/lib/prisma';

/**
 * Check if a user is an admin
 * Admin can be:
 * 1. User with isAdmin=true in database
 * 2. User whose GitHub ID matches ADMIN_GITHUB_ID env var (super admin)
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const adminGithubId = process.env.ADMIN_GITHUB_ID;

  // Find user with accounts
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      accounts: {
        where: { provider: 'github' },
        select: { providerAccountId: true },
      },
    },
  });

  if (!user) {
    return false;
  }

  // Check if user has isAdmin flag
  if (user.isAdmin) {
    return true;
  }

  // Check if user's GitHub ID matches super admin
  if (adminGithubId && user.accounts.length > 0) {
    return user.accounts.some(
      (account) => account.providerAccountId === adminGithubId
    );
  }

  return false;
}

/**
 * Check if a user is the super admin (ADMIN_GITHUB_ID)
 * Super admin cannot have their admin status revoked
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const adminGithubId = process.env.ADMIN_GITHUB_ID;
  if (!adminGithubId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accounts: {
        where: { provider: 'github' },
        select: { providerAccountId: true },
      },
    },
  });

  if (!user || !user.accounts.length) return false;

  return user.accounts.some(
    (account) => account.providerAccountId === adminGithubId
  );
}

/**
 * Get admin user ID from environment config
 * Returns null if admin is not configured or user not found
 */
export async function getAdminUserId(): Promise<string | null> {
  const adminGithubId = process.env.ADMIN_GITHUB_ID;

  if (!adminGithubId) {
    return null;
  }

  // Find user with this GitHub account
  const account = await prisma.account.findFirst({
    where: {
      provider: 'github',
      providerAccountId: adminGithubId,
    },
    select: { userId: true },
  });

  return account?.userId ?? null;
}
