/**
 * Import Dataset API
 * POST /api/share/datasets/import - Add a stock to user's collection
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

    // Check if already in user's collection
    const existing = await prisma.userStock.findUnique({
      where: {
        userId_stockId: { userId, stockId },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Already imported', message: 'This stock is already in your collection' },
        { status: 409 }
      );
    }

    // Add to user's collection
    const userStock = await prisma.userStock.create({
      data: {
        userId,
        stockId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Added ${stock.symbol} to your collection`,
      userStock: {
        id: userStock.id,
        stockId: userStock.stockId,
        addedAt: userStock.addedAt,
      },
      stock,
    });
  } catch (error) {
    console.error('Error importing dataset:', error);
    return NextResponse.json(
      { error: 'Import failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
