/**
 * Individual Invitation API
 * POST /api/invitations/:id - Accept or reject invitation
 * DELETE /api/invitations/:id - Cancel invitation (for group owner)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// POST /api/invitations/:id - Accept or reject invitation
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

    const invitation = await prisma.userGroupInvitation.findUnique({
      where: { id: params.id },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Only the invited user can accept/reject
    if (invitation.userId !== userId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Invalid operation', message: `Invitation already ${invitation.status}` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (action !== 'accept' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'action must be "accept" or "reject"' },
        { status: 400 }
      );
    }

    if (action === 'accept') {
      // Accept: update invitation status and add user as member
      await prisma.$transaction([
        prisma.userGroupInvitation.update({
          where: { id: params.id },
          data: { status: 'accepted' },
        }),
        prisma.userGroupMember.create({
          data: {
            groupId: invitation.groupId,
            userId,
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        action: 'accepted',
        message: `You have joined "${invitation.group.name}"`,
        groupId: invitation.groupId,
      });
    } else {
      // Reject: just update invitation status
      await prisma.userGroupInvitation.update({
        where: { id: params.id },
        data: { status: 'rejected' },
      });

      return NextResponse.json({
        success: true,
        action: 'rejected',
        message: `Invitation to "${invitation.group.name}" declined`,
      });
    }
  } catch (error) {
    console.error('Error processing invitation:', error);
    return NextResponse.json(
      { error: 'Failed to process invitation', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/invitations/:id - Cancel invitation (for group owner)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const invitation = await prisma.userGroupInvitation.findUnique({
      where: { id: params.id },
      include: {
        group: { select: { ownerId: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Only group owner can cancel invitations
    if (invitation.group.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the group owner can cancel invitations' },
        { status: 403 }
      );
    }

    await prisma.userGroupInvitation.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Invitation cancelled',
    });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    return NextResponse.json(
      { error: 'Failed to cancel invitation', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
