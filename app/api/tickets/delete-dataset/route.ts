/**
 * Delete Dataset Request API
 * POST /api/tickets/delete-dataset - Request to delete a custom dataset
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
    const { stockId, reason } = body;

    if (!stockId) {
      return NextResponse.json(
        { error: 'Missing stockId', message: 'Stock ID is required' },
        { status: 400 }
      );
    }

    // Verify the stock exists and is a custom_upload
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
    });

    if (!stock) {
      return NextResponse.json(
        { error: 'Not found', message: 'Dataset not found' },
        { status: 404 }
      );
    }

    if (stock.dataSource !== 'custom_upload') {
      return NextResponse.json(
        { error: 'Invalid operation', message: 'Can only request deletion for custom uploaded datasets' },
        { status: 400 }
      );
    }

    // Check if user owns this dataset (has it in their collection)
    const userStock = await prisma.userStock.findUnique({
      where: { userId_stockId: { userId, stockId } },
    });

    if (!userStock) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You can only request deletion for datasets in your collection' },
        { status: 403 }
      );
    }

    // Check for existing pending deletion request
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        userId,
        type: 'DELETE_DATASET',
        status: 'PENDING',
        payload: {
          path: ['stockId'],
          equals: stockId,
        },
      },
    });

    if (existingTicket) {
      return NextResponse.json(
        { error: 'Duplicate ticket', message: 'You already have a pending deletion request for this dataset' },
        { status: 409 }
      );
    }

    // Create the ticket
    const ticket = await prisma.ticket.create({
      data: {
        userId,
        type: 'DELETE_DATASET',
        payload: {
          stockId,
          symbol: stock.symbol,
          name: stock.name,
          reason: reason?.trim() || null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Deletion request submitted for admin approval',
      ticket: {
        id: ticket.id,
        type: ticket.type,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating deletion request:', error);
    return NextResponse.json(
      { error: 'Failed to create request', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
