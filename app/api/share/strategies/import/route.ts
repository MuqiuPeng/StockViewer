/**
 * Import Strategy API
 * POST /api/share/strategies/import - Subscribe to a strategy with optional displayName
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
    const { strategyId, displayName } = body;

    if (!strategyId) {
      return NextResponse.json(
        { error: 'Missing strategyId', message: 'strategyId is required' },
        { status: 400 }
      );
    }

    // Check if strategy exists and is accessible
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        id: true,
        name: true,
        description: true,
        strategyType: true,
        createdBy: true,
        visibleTo: true,
      },
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found', message: 'The specified strategy does not exist' },
        { status: 404 }
      );
    }

    // Check if user has access (public or shared with them)
    const isPublic = strategy.visibleTo.length === 0;
    const isSharedWithUser = strategy.visibleTo.includes(userId);
    const isOwner = strategy.createdBy === userId;

    if (!isPublic && !isSharedWithUser && !isOwner) {
      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have access to this strategy' },
        { status: 403 }
      );
    }

    // Check if already subscribed
    const existing = await prisma.userStrategy.findUnique({
      where: {
        userId_strategyId: { userId, strategyId },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Already subscribed', message: 'You are already subscribed to this strategy' },
        { status: 409 }
      );
    }

    // Subscribe with optional displayName
    const userStrategy = await prisma.userStrategy.create({
      data: {
        userId,
        strategyId,
        displayName: displayName?.trim() || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Subscribed to strategy "${displayName || strategy.name}"`,
      subscription: {
        id: userStrategy.id,
        strategyId: userStrategy.strategyId,
        displayName: userStrategy.displayName,
        addedAt: userStrategy.addedAt,
      },
      strategy: {
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        strategyType: strategy.strategyType,
      },
    });
  } catch (error) {
    console.error('Error importing strategy:', error);
    return NextResponse.json(
      { error: 'Import failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
