/**
 * User Invitations API
 * GET /api/invitations - List user's pending invitations
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/invitations - List user's pending invitations
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const invitations = await prisma.userGroupInvitation.findMany({
      where: {
        userId,
        status: 'pending',
      },
      include: {
        group: {
          include: {
            owner: { select: { id: true, name: true, image: true } },
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        group: {
          id: inv.group.id,
          name: inv.group.name,
          description: inv.group.description,
          owner: inv.group.owner,
          memberCount: inv.group._count.members,
        },
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error loading invitations:', error);
    return NextResponse.json(
      { error: 'Failed to load invitations', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
