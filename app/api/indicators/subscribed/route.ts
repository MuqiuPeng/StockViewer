/**
 * User's subscribed indicators API
 * GET /api/indicators/subscribed - Get indicators the user has subscribed to
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/indicators/subscribed - Get user's subscribed indicators
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const subscriptions = await prisma.indicatorSubscription.findMany({
      where: { userId: authResult.userId },
      include: {
        indicator: {
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
            version: true,
            downloadCount: true,
            rating: true,
            ratingCount: true,
            publishedAt: true,
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
        },
      },
      orderBy: { subscribedAt: 'desc' },
    });

    // Transform to indicator format with subscription metadata
    const indicators = subscriptions.map(sub => ({
      ...sub.indicator,
      subscriptionId: sub.id,
      subscribedAt: sub.subscribedAt,
      autoUpdate: sub.autoUpdate,
      visibility: 'PUBLIC', // All subscribed indicators are public
    }));

    return NextResponse.json({ indicators });
  } catch (error) {
    console.error('Error getting subscribed indicators:', error);
    return NextResponse.json(
      { error: 'Failed to get subscribed indicators', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
