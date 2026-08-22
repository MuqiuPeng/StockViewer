/**
 * Log ingestion endpoint for frontend
 * POST /api/admin/logs/ingest — Create a log entry from authenticated user
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getApiStorage } from '@/lib/api-auth';
import { LogLevel, LogSource } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { action, message, level, metadata } = body;

    if (!action || !message) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'action and message are required' },
        { status: 400 },
      );
    }

    const logLevel = level && Object.values(LogLevel).includes(level) ? level : LogLevel.INFO;

    logger[logLevel.toLowerCase() as 'info' | 'warn' | 'error'](
      LogSource.FRONTEND,
      action,
      message,
      { userId, metadata },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error ingesting log:', error);
    return NextResponse.json(
      { error: 'Failed to ingest log' },
      { status: 500 },
    );
  }
}
