/**
 * Transfer Team Ownership API
 * POST /api/teams/:id/transfer - Transfer ownership to another member
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// POST /api/teams/:id/transfer - Transfer ownership
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const team = await prisma.team.findUnique({
      where: { id: params.id },
      include: { members: true },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Only owner can transfer
    if (team.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can transfer ownership' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { newOwnerId } = body;

    if (!newOwnerId) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'newOwnerId is required' },
        { status: 400 }
      );
    }

    // Cannot transfer to yourself
    if (newOwnerId === userId) {
      return NextResponse.json(
        { error: 'Invalid operation', message: 'You are already the owner' },
        { status: 400 }
      );
    }

    // New owner must be a member
    const isMember = team.members.some(m => m.userId === newOwnerId);
    if (!isMember) {
      return NextResponse.json(
        { error: 'Invalid target', message: 'New owner must be an existing member' },
        { status: 400 }
      );
    }

    // Transfer ownership in a transaction
    await prisma.$transaction([
      // Update team owner
      prisma.team.update({
        where: { id: params.id },
        data: { ownerId: newOwnerId },
      }),
      // Remove new owner from members (owner is not in members)
      prisma.teamMember.delete({
        where: {
          teamId_userId: {
            teamId: params.id,
            userId: newOwnerId,
          },
        },
      }),
      // Add old owner as a member
      prisma.teamMember.create({
        data: {
          teamId: params.id,
          userId,
        },
      }),
    ]);

    const newOwner = await prisma.user.findUnique({
      where: { id: newOwnerId },
      select: { id: true, name: true, image: true },
    });

    return NextResponse.json({
      success: true,
      message: `Ownership transferred to ${newOwner?.name || 'the new owner'}`,
      newOwner,
    });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    return NextResponse.json(
      { error: 'Failed to transfer ownership', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
