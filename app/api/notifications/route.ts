/**
 * User Notifications API
 * GET /api/notifications - Get user's notifications (tickets + invitations)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Get user's tickets with their status
    const tickets = await prisma.ticket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        reviewer: {
          select: { name: true },
        },
      },
    });

    // Get pending invitations
    const invitations = await prisma.teamInvitation.findMany({
      where: {
        userId,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        team: {
          include: {
            owner: {
              select: { id: true, name: true, image: true },
            },
            _count: {
              select: { members: true },
            },
          },
        },
      },
    });

    // Format tickets
    const formattedTickets = tickets.map(ticket => ({
      id: ticket.id,
      type: ticket.type,
      status: ticket.status,
      payload: ticket.payload as any,
      reviewNote: ticket.reviewNote,
      reviewerName: ticket.reviewer?.name || null,
      reviewedAt: ticket.reviewedAt?.toISOString() || null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    }));

    // Format invitations
    const formattedInvitations = invitations.map(inv => ({
      id: inv.id,
      group: {
        id: inv.team.id,
        name: inv.team.name,
        description: inv.team.description,
        owner: inv.team.owner,
        memberCount: inv.team._count.members + 1, // +1 for owner
      },
      createdAt: inv.createdAt.toISOString(),
    }));

    // Count unread (pending tickets that were recently updated, pending invitations)
    const unreadCount = invitations.length + tickets.filter(t =>
      t.status !== 'PENDING' &&
      t.updatedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Updated in last 7 days
    ).length;

    return NextResponse.json({
      tickets: formattedTickets,
      invitations: formattedInvitations,
      unreadCount,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
