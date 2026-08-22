/**
 * Admin logs API
 * GET  /api/admin/logs — List logs with filters and pagination
 * DELETE /api/admin/logs?olderThanDays=N — Delete logs older than N days
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { LogLevel, LogSource, Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminStatus = await isAdmin(session.user.id);
    if (!adminStatus) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level') as LogLevel | null;
    const source = searchParams.get('source') as LogSource | null;
    const action = searchParams.get('action');
    const search = searchParams.get('search');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const where: Prisma.SystemLogWhereInput = {};
    if (level && Object.values(LogLevel).includes(level)) where.level = level;
    if (source && Object.values(LogSource).includes(source)) where.source = source;
    if (action) where.action = action;
    if (search) where.message = { contains: search, mode: 'insensitive' };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total, statsRaw] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.systemLog.count({ where }),
      prisma.systemLog.groupBy({
        by: ['level'],
        _count: true,
        where,
      }),
    ]);

    const stats = { INFO: 0, WARN: 0, ERROR: 0 };
    for (const s of statsRaw) {
      stats[s.level] = s._count;
    }

    return NextResponse.json({
      logs,
      total,
      stats,
      pagination: { page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminStatus = await isAdmin(session.user.id);
    if (!adminStatus) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '', 10);

    if (isNaN(olderThanDays) || ![0, 1, 7, 30].includes(olderThanDays)) {
      return NextResponse.json(
        { error: 'Invalid parameter', message: 'olderThanDays must be 0, 1, 7, or 30' },
        { status: 400 },
      );
    }

    const where: Prisma.SystemLogWhereInput = {};
    if (olderThanDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);
      where.createdAt = { lt: cutoff };
    }

    const result = await prisma.systemLog.deleteMany({ where });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error('Error deleting logs:', error);
    return NextResponse.json(
      { error: 'Failed to delete logs', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
