/**
 * Indicator Cache Cleanup API
 * POST /api/indicators/cleanup-cache - Clean up old version indicator caches
 *
 * This endpoint triggers a background cleanup of indicator values
 * that belong to outdated versions. Should be called periodically
 * (e.g., via cron job) to free up storage space.
 */

import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import { cleanupOldVersionCaches } from '@/lib/indicator-compute';

export const runtime = 'nodejs';

// POST /api/indicators/cleanup-cache - Run cleanup task
export async function POST() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    // Run the cleanup task
    const result = await cleanupOldVersionCaches();

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: `Cleaned up ${result.deleted} outdated indicator cache entries`,
    });
  } catch (error) {
    console.error('Error cleaning up indicator cache:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup cache', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/indicators/cleanup-cache - Get cache statistics
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    // Import prisma here to avoid circular dependencies
    const { prisma } = await import('@/lib/prisma');

    // Get statistics about outdated cache entries
    const outdatedCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "IndicatorValue" iv
      WHERE iv.version != (
        SELECT version FROM "Indicator" WHERE id = iv."indicatorId"
      )
    `;

    const totalCount = await prisma.indicatorValue.count();

    const stockIndicatorCount = await prisma.stockIndicator.count();

    return NextResponse.json({
      total: totalCount,
      outdated: Number(outdatedCount[0].count),
      stockIndicators: stockIndicatorCount,
    });
  } catch (error) {
    console.error('Error getting cache statistics:', error);
    return NextResponse.json(
      { error: 'Failed to get cache statistics', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
