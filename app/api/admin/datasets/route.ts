/**
 * Admin Custom Datasets Management API
 * GET /api/admin/datasets - List all custom_upload datasets
 * DELETE /api/admin/datasets - Delete a custom dataset
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { isAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      console.log('Admin datasets: auth failed');
      return authResult.response;
    }
    const { userId } = authResult;

    // Check admin
    const adminStatus = await isAdmin(userId);
    console.log('Admin datasets check:', { userId, isAdmin: adminStatus });
    if (!adminStatus) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search');

    // Build where clause
    const where: Record<string, unknown> = {
      dataSource: 'custom_upload',
    };

    if (search && search.trim()) {
      where.OR = [
        { symbol: { contains: search.trim(), mode: 'insensitive' } },
        { name: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.stock.count({ where });

    // Get datasets with user info
    const datasets = await prisma.stock.findMany({
      where,
      include: {
        userStocks: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: { addedAt: 'asc' },
          take: 1, // Get the first user who added it (likely the uploader)
        },
        sharePosts: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      datasets: datasets.map((ds) => ({
        id: ds.id,
        symbol: ds.symbol,
        name: ds.name,
        dataSource: ds.dataSource,
        rowCount: ds.rowCount,
        firstDate: ds.firstDate,
        lastDate: ds.lastDate,
        createdAt: ds.createdAt,
        uploader: ds.userStocks[0]?.user || null,
        postCount: ds.sharePosts.length,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing custom datasets:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Check admin
    if (!(await isAdmin(userId))) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { stockId } = body;

    if (!stockId) {
      return NextResponse.json(
        { error: 'Missing stockId', message: 'Stock ID is required' },
        { status: 400 }
      );
    }

    // Verify it's a custom_upload dataset
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
        { error: 'Invalid operation', message: 'Can only delete custom uploaded datasets' },
        { status: 400 }
      );
    }

    // Delete the stock (cascade will handle related records except SharePosts)
    // SharePosts will have their stockId set to null due to the relation
    await prisma.stock.delete({
      where: { id: stockId },
    });

    return NextResponse.json({
      success: true,
      message: `Dataset "${stock.symbol}" deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting custom dataset:', error);
    return NextResponse.json(
      { error: 'Failed to delete dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
