/**
 * Admin authentication helper
 */

import { prisma } from '@/lib/prisma';

/**
 * Check if a user is an admin based on their GitHub account ID
 * The admin GitHub ID is configured via ADMIN_GITHUB_ID environment variable
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const adminGithubId = process.env.ADMIN_GITHUB_ID;

  // No admin configured
  if (!adminGithubId) {
    return false;
  }

  // Find user's GitHub account
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: {
        where: { provider: 'github' },
        select: { providerAccountId: true },
      },
    },
  });

  if (!user || !user.accounts.length) {
    return false;
  }

  // Check if any of the user's GitHub accounts matches the admin ID
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
