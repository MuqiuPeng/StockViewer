/**
 * Import Indicator API
 * POST /api/share/indicators/import - Subscribe to an indicator with optional displayName
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { indicatorId, displayName } = body;

    if (!indicatorId) {
      return NextResponse.json(
        { error: 'Missing indicatorId', message: 'indicatorId is required' },
        { status: 400 }
      );
    }

    // Check if indicator exists and is accessible
    const indicator = await prisma.indicator.findUnique({
      where: { id: indicatorId },
      select: {
        id: true,
        name: true,
        description: true,
        createdBy: true,
        visibleTo: true,
        category: true,
      },
    });

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found', message: 'The specified indicator does not exist' },
        { status: 404 }
      );
    }

    // Check if user has access (public or shared with them)
    const isPublic = indicator.visibleTo.length === 0;
    const isSharedWithUser = indicator.visibleTo.includes(userId);
    const isOwner = indicator.createdBy === userId;

    if (!isPublic && !isSharedWithUser && !isOwner) {
      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have access to this indicator' },
        { status: 403 }
      );
    }

    // Check if already subscribed
    const existing = await prisma.userIndicator.findUnique({
      where: {
        userId_indicatorId: { userId, indicatorId },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Already subscribed', message: 'You are already subscribed to this indicator' },
        { status: 409 }
      );
    }

    // Subscribe with optional displayName
    const userIndicator = await prisma.userIndicator.create({
      data: {
        userId,
        indicatorId,
        displayName: displayName?.trim() || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Subscribed to indicator "${displayName || indicator.name}"`,
      subscription: {
        id: userIndicator.id,
        indicatorId: userIndicator.indicatorId,
        displayName: userIndicator.displayName,
        addedAt: userIndicator.addedAt,
      },
      indicator: {
        id: indicator.id,
        name: indicator.name,
        description: indicator.description,
        category: indicator.category,
      },
    });
  } catch (error) {
    console.error('Error importing indicator:', error);
    return NextResponse.json(
      { error: 'Import failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
