/**
 * Accessible indicators API (indicators shared with user or public)
 * GET /api/indicators/subscribed - Get indicators the user can access (not owned by them)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/indicators/subscribed - Get indicators accessible to user (not owned)
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const userId = authResult.userId;

    // Get indicators that are:
    // 1. Public (visibleTo is empty) OR
    // 2. Shared with this user (userId in visibleTo)
    // But NOT owned by this user
    const indicators = await prisma.indicator.findMany({
      where: {
        AND: [
          { ownerId: { not: userId } },  // Not owned by user
          {
            OR: [
              { visibleTo: { isEmpty: true } },  // Public
              { visibleTo: { has: userId } },    // Shared with user
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        pythonCode: true,
        outputColumn: true,
        dependencies: true,
        dependencyColumns: true,
        isGroup: true,
        groupName: true,
        expectedOutputs: true,
        externalDatasets: true,
        category: true,
        tags: true,
        visibleTo: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform to add visibility info
    const transformedIndicators = indicators.map(ind => ({
      ...ind,
      isPublic: ind.visibleTo.length === 0,
    }));

    return NextResponse.json({ indicators: transformedIndicators });
  } catch (error) {
    console.error('Error getting accessible indicators:', error);
    return NextResponse.json(
      { error: 'Failed to get accessible indicators', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
