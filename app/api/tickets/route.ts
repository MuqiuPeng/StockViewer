/**
 * User Tickets API
 * POST /api/tickets - Submit a new ticket
 * GET /api/tickets - List user's own tickets
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { TicketType } from '@prisma/client';

export const runtime = 'nodejs';

// Valid ticket types
const VALID_TICKET_TYPES: TicketType[] = ['CUSTOM_DATA', 'DELETE_DATASET'];

// POST /api/tickets - Submit a new ticket
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { type, payload } = body;

    // Validate ticket type
    if (!type || !VALID_TICKET_TYPES.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid ticket type', message: `type must be one of: ${VALID_TICKET_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate payload
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { error: 'Invalid payload', message: 'payload is required and must be an object' },
        { status: 400 }
      );
    }

    // Create ticket
    const ticket = await prisma.ticket.create({
      data: {
        userId,
        type,
        payload,
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Ticket submitted successfully',
      ticket: {
        id: ticket.id,
        type: ticket.type,
        status: ticket.status,
        payload: ticket.payload,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to create ticket', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/tickets - List user's own tickets
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    // Build filter
    const where: any = { userId };
    if (status) {
      where.status = status.toUpperCase();
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        payload: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
        reviewer: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error('Error listing tickets:', error);
    return NextResponse.json(
      { error: 'Failed to list tickets', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
