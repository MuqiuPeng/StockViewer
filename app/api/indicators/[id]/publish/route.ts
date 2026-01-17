/**
 * Indicator publish API
 * POST /api/indicators/:id/publish - Publish an indicator to the public library
 * DELETE /api/indicators/:id/publish - Unpublish an indicator
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// POST /api/indicators/:id/publish - Publish indicator to library
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const body = await request.json().catch(() => ({}));
    const { category, tags } = body;

    // Find the indicator
    const indicator = await prisma.indicator.findUnique({
      where: { id: params.id },
    });

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (indicator.ownerId !== authResult.userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You can only publish your own indicators' },
        { status: 403 }
      );
    }

    // Check if already published
    if (indicator.visibility === 'PUBLIC') {
      return NextResponse.json(
        { error: 'Already published', message: 'This indicator is already public' },
        { status: 400 }
      );
    }

    // Update indicator to public
    const updatedIndicator = await prisma.indicator.update({
      where: { id: params.id },
      data: {
        visibility: 'PUBLIC',
        publishedAt: new Date(),
        category: category || indicator.category,
        tags: tags || indicator.tags,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Indicator published to library',
      indicator: {
        id: updatedIndicator.id,
        name: updatedIndicator.name,
        visibility: updatedIndicator.visibility,
        publishedAt: updatedIndicator.publishedAt,
        category: updatedIndicator.category,
        tags: updatedIndicator.tags,
      },
    });
  } catch (error) {
    console.error('Error publishing indicator:', error);
    return NextResponse.json(
      { error: 'Failed to publish indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/indicators/:id/publish - Unpublish indicator
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    // Find the indicator
    const indicator = await prisma.indicator.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (indicator.ownerId !== authResult.userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You can only unpublish your own indicators' },
        { status: 403 }
      );
    }

    // Check if already private
    if (indicator.visibility === 'PRIVATE') {
      return NextResponse.json(
        { error: 'Already private', message: 'This indicator is already private' },
        { status: 400 }
      );
    }

    // Warn about subscribers
    const subscriberCount = indicator._count.subscriptions;

    // Update indicator to private (this will also cascade delete subscriptions due to schema)
    const updatedIndicator = await prisma.indicator.update({
      where: { id: params.id },
      data: {
        visibility: 'PRIVATE',
        publishedAt: null,
      },
    });

    // Delete all subscriptions (users will lose access)
    await prisma.indicatorSubscription.deleteMany({
      where: { indicatorId: params.id },
    });

    return NextResponse.json({
      success: true,
      message: `Indicator unpublished. ${subscriberCount} subscriber(s) will lose access.`,
      indicator: {
        id: updatedIndicator.id,
        name: updatedIndicator.name,
        visibility: updatedIndicator.visibility,
      },
      affectedSubscribers: subscriberCount,
    });
  } catch (error) {
    console.error('Error unpublishing indicator:', error);
    return NextResponse.json(
      { error: 'Failed to unpublish indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
