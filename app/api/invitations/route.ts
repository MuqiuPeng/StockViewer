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

    const invitations = await prisma.teamInvitation.findMany({
      where: {
        userId,
        status: 'pending',
      },
      include: {
        team: {
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
        team: {
          id: inv.team.id,
          name: inv.team.name,
          description: inv.team.description,
          owner: inv.team.owner,
          memberCount: inv.team._count.members,
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
