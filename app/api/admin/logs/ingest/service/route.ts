/**
 * Log ingestion endpoint for data-service
 * POST /api/admin/logs/ingest/service — Batch ingest logs from Python data service
 * Authenticated via X-Log-Secret header
 */

import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LogLevel, LogSource, Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const secret = request.headers.get('X-Log-Secret');
    const expectedSecret = process.env.LOG_INGEST_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { entries } = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'entries array is required' },
        { status: 400 },
      );
    }

    const data = entries
      .filter((e: { action?: string; message?: string }) => e.action && e.message)
      .map((e: { level?: string; action: string; message: string; metadata?: Record<string, unknown> }) => ({
        level: e.level && Object.values(LogLevel).includes(e.level as LogLevel)
          ? (e.level as LogLevel)
          : LogLevel.INFO,
        source: LogSource.DATA_SERVICE,
        action: e.action,
        message: e.message,
        metadata: (e.metadata ?? Prisma.DbNull) as Prisma.InputJsonValue,
      }));

    if (data.length > 0) {
      await prisma.systemLog.createMany({ data });
    }

    return NextResponse.json({ success: true, ingested: data.length });
  } catch (error) {
    console.error('Error ingesting service logs:', error);
    return NextResponse.json(
      { error: 'Failed to ingest logs' },
      { status: 500 },
    );
  }
}
