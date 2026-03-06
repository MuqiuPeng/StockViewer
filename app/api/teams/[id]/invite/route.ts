/**
 * Team Invitation API
 * POST /api/teams/:id/invite - Send invitation (owner only)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// POST /api/teams/:id/invite - Send invitation
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

    // Only owner can invite
    if (team.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can invite members' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const targetUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found', message: `No user found with email "${email}"` },
        { status: 404 }
      );
    }

    // Cannot invite yourself
    if (targetUser.id === userId) {
      return NextResponse.json(
        { error: 'Invalid operation', message: 'You cannot invite yourself' },
        { status: 400 }
      );
    }

    // Check if already a member
    const isMember = team.members.some(m => m.userId === targetUser.id);
    if (isMember) {
      return NextResponse.json(
        { error: 'Already a member', message: `${targetUser.name || email} is already a member` },
        { status: 400 }
      );
    }

    // Check if invitation already exists
    const existingInvitation = await prisma.teamInvitation.findUnique({
      where: {
        teamId_userId: {
          teamId: params.id,
          userId: targetUser.id,
        },
      },
    });

    if (existingInvitation) {
      if (existingInvitation.status === 'pending') {
        return NextResponse.json(
          { error: 'Invitation pending', message: `An invitation is already pending for ${targetUser.name || email}` },
          { status: 400 }
        );
      }
      // Update existing invitation (if rejected before)
      const updated = await prisma.teamInvitation.update({
        where: { id: existingInvitation.id },
        data: { status: 'pending', createdAt: new Date() },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });

      return NextResponse.json({
        success: true,
        invitation: {
          id: updated.id,
          user: updated.user,
          status: updated.status,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    }

    // Create new invitation
    const invitation = await prisma.teamInvitation.create({
      data: {
        teamId: params.id,
        userId: targetUser.id,
        status: 'pending',
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        user: invitation.user,
        status: invitation.status,
        createdAt: invitation.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error sending invitation:', error);
    return NextResponse.json(
      { error: 'Failed to send invitation', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
