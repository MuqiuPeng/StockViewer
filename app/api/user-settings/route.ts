import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stat, mkdir } from 'fs/promises';
import { join } from 'path';

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
        csvDataPath: null,
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
    const { csvDataPath, setupComplete } = body;

    // Validate CSV path if provided
    if (csvDataPath) {
      // Normalize path - expand ~ to home directory on Unix
      let normalizedPath = csvDataPath;
      if (normalizedPath.startsWith('~')) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        normalizedPath = normalizedPath.replace(/^~/, homeDir);
      }

      try {
        // Check if path exists
        const stats = await stat(normalizedPath);
        if (!stats.isDirectory()) {
          return NextResponse.json(
            { error: 'Invalid path', message: 'The specified path is not a directory' },
            { status: 400 }
          );
        }
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          // Path doesn't exist - try to create it
          try {
            await mkdir(normalizedPath, { recursive: true });
            console.log(`Created CSV directory: ${normalizedPath}`);
          } catch (mkdirErr: any) {
            console.error(`Failed to create directory ${normalizedPath}:`, mkdirErr);
            return NextResponse.json(
              { error: 'Invalid path', message: `Cannot create directory: ${mkdirErr.message}` },
              { status: 400 }
            );
          }
        } else {
          console.error(`Cannot access path ${normalizedPath}:`, err);
          return NextResponse.json(
            { error: 'Invalid path', message: `Cannot access path: ${err.message}` },
            { status: 400 }
          );
        }
      }

      // Use normalized path for storage
      body.csvDataPath = normalizedPath;
    }

    // Upsert user settings (use body.csvDataPath which may be normalized)
    const settings = await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      update: {
        ...(body.csvDataPath !== undefined && { csvDataPath: body.csvDataPath }),
        ...(setupComplete !== undefined && { setupComplete }),
      },
      create: {
        userId: session.user.id,
        csvDataPath: body.csvDataPath || null,
        setupComplete: setupComplete || false,
      },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error updating user settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
