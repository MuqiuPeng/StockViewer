/**
 * Indicator subscribe API
 * POST /api/indicators/:id/subscribe - Subscribe to a public indicator
 * DELETE /api/indicators/:id/subscribe - Unsubscribe from an indicator
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// POST /api/indicators/:id/subscribe - Subscribe to public indicator
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
    const { autoUpdate = true } = body;

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

    // Check if public or unlisted (subscribable)
    if (indicator.visibility === 'PRIVATE') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot subscribe to private indicators' },
        { status: 403 }
      );
    }

    // Check if user is the owner (can't subscribe to own indicator)
    if (indicator.ownerId === authResult.userId) {
      return NextResponse.json(
        { error: 'Invalid operation', message: 'You cannot subscribe to your own indicator' },
        { status: 400 }
      );
    }

    // Check if already subscribed
    const existingSubscription = await prisma.indicatorSubscription.findUnique({
      where: {
        userId_indicatorId: {
          userId: authResult.userId,
          indicatorId: params.id,
        },
      },
    });

    if (existingSubscription) {
      return NextResponse.json(
        { error: 'Already subscribed', message: 'You are already subscribed to this indicator' },
        { status: 400 }
      );
    }

    // Create subscription and increment download count
    const [subscription] = await prisma.$transaction([
      prisma.indicatorSubscription.create({
        data: {
          userId: authResult.userId,
          indicatorId: params.id,
          autoUpdate,
        },
      }),
      prisma.indicator.update({
        where: { id: params.id },
        data: {
          downloadCount: { increment: 1 },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Successfully subscribed to indicator',
      subscription: {
        id: subscription.id,
        indicatorId: subscription.indicatorId,
        subscribedAt: subscription.subscribedAt,
        autoUpdate: subscription.autoUpdate,
      },
    });
  } catch (error) {
    console.error('Error subscribing to indicator:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe to indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/indicators/:id/subscribe - Unsubscribe from indicator
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    // Find the subscription
    const subscription = await prisma.indicatorSubscription.findUnique({
      where: {
        userId_indicatorId: {
          userId: authResult.userId,
          indicatorId: params.id,
        },
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'Not subscribed', message: 'You are not subscribed to this indicator' },
        { status: 404 }
      );
    }

    // Delete subscription
    await prisma.indicatorSubscription.delete({
      where: { id: subscription.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed from indicator',
    });
  } catch (error) {
    console.error('Error unsubscribing from indicator:', error);
    return NextResponse.json(
      { error: 'Failed to unsubscribe from indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/indicators/:id/subscribe - Check subscription status
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const subscription = await prisma.indicatorSubscription.findUnique({
      where: {
        userId_indicatorId: {
          userId: authResult.userId,
          indicatorId: params.id,
        },
      },
    });

    return NextResponse.json({
      subscribed: !!subscription,
      subscription: subscription ? {
        id: subscription.id,
        subscribedAt: subscription.subscribedAt,
        autoUpdate: subscription.autoUpdate,
      } : null,
    });
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return NextResponse.json(
      { error: 'Failed to check subscription status', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
