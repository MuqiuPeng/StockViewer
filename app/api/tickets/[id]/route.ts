/**
 * Ticket Detail API
 * GET /api/tickets/:id - Get ticket details (user's own ticket only)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/tickets/:id - Get ticket details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: {
          select: { name: true, email: true },
        },
        reviewer: {
          select: { name: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Users can only view their own tickets
    if (ticket.userId !== userId) {
      return NextResponse.json(
        { error: 'Access denied', message: 'You can only view your own tickets' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ticket: {
        id: ticket.id,
        type: ticket.type,
        status: ticket.status,
        payload: ticket.payload,
        reviewedBy: ticket.reviewer?.name,
        reviewNote: ticket.reviewNote,
        reviewedAt: ticket.reviewedAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ticket', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
