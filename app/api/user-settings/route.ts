import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { LogSource } from '@prisma/client';

export const runtime = 'nodejs';

// GET /api/user-settings - Get current user's settings
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
    });

    // Return settings or defaults
    return NextResponse.json({
      settings: settings || {
        setupComplete: false,
      },
    });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/user-settings - Create or update user settings
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { setupComplete } = body;

    // Upsert user settings
    const settings = await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      update: {
        ...(setupComplete !== undefined && { setupComplete }),
      },
      create: {
        userId: session.user.id,
        setupComplete: setupComplete || false,
      },
    });

    logger.info(LogSource.API, 'update_user_settings', 'Updated user settings', { userId: session.user.id, metadata: { setupComplete } });

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error(LogSource.API, 'update_user_settings', 'Failed to update settings', { error });
    console.error('Error updating user settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
