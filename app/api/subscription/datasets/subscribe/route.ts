/**
 * Subscribe to Dataset API
 * POST /api/subscription/datasets/subscribe - Add a stock to user's collection
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
    const { stockId } = body;

    if (!stockId) {
      return NextResponse.json(
        { error: 'Missing stockId', message: 'stockId is required' },
        { status: 400 }
      );
    }

    // Check if stock exists
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: { id: true, symbol: true, name: true, dataSource: true },
    });

    if (!stock) {
      return NextResponse.json(
        { error: 'Stock not found', message: 'The specified stock does not exist' },
        { status: 404 }
      );
    }

    // Check if already subscribed
    const existing = await prisma.userStock.findUnique({
      where: {
        userId_stockId: { userId, stockId },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Already subscribed', message: 'You are already subscribed to this dataset' },
        { status: 409 }
      );
    }

    // Add to user's collection (subscribe)
    const userStock = await prisma.userStock.create({
      data: {
        userId,
        stockId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Subscribed to ${stock.symbol}`,
      subscription: {
        id: userStock.id,
        stockId: userStock.stockId,
        addedAt: userStock.addedAt,
      },
      stock,
    });
  } catch (error) {
    console.error('Error subscribing to dataset:', error);
    return NextResponse.json(
      { error: 'Subscribe failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
