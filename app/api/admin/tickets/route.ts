/**
 * Admin Tickets API
 * GET /api/admin/tickets - List all tickets (admin only)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { isAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/tickets - List all tickets (admin only)
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Check admin permission
    const admin = await isAdmin(userId);
    if (!admin) {
      return NextResponse.json(
        { error: 'Access denied', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build filter
    const where: any = {};
    if (status) {
      where.status = status.toUpperCase();
    }
    if (type) {
      where.type = type.toUpperCase();
    }

    // Get tickets with pagination
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          reviewer: {
            select: { name: true },
          },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    // Get stats
    const stats = await prisma.ticket.groupBy({
      by: ['status'],
      _count: true,
    });

    const statusCounts = Object.fromEntries(
      stats.map((s) => [s.status, s._count])
    );

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        payload: t.payload,
        user: t.user,
        reviewer: t.reviewer?.name,
        reviewNote: t.reviewNote,
        reviewedAt: t.reviewedAt,
        createdAt: t.createdAt,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + tickets.length < total,
      },
      stats: statusCounts,
    });
  } catch (error) {
    console.error('Error listing tickets:', error);
    return NextResponse.json(
      { error: 'Failed to list tickets', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
