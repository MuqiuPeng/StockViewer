import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';

// GET /api/admin/users - Get all users with stats
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminStatus = await isAdmin(session.user.id);
    if (!adminStatus) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as UserStatus | null;

    const where = status ? { status } : {};
    const superAdminGithubId = process.env.ADMIN_GITHUB_ID;

    const [users, stats] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          status: true,
          isAdmin: true,
          createdAt: true,
          accounts: {
            select: {
              provider: true,
              providerAccountId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ]);

    // Mark super admin users
    const usersWithSuperAdmin = users.map((user) => ({
      ...user,
      isSuperAdmin: superAdminGithubId
        ? user.accounts.some(
            (acc) => acc.provider === 'github' && acc.providerAccountId === superAdminGithubId
          )
        : false,
    }));

    const statusCounts = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    stats.forEach((s) => {
      statusCounts[s.status] = s._count.status;
    });

    return NextResponse.json({
      users: usersWithSuperAdmin,
      stats: statusCounts,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
