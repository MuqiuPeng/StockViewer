/**
 * Indicator rating API
 * POST /api/indicators/:id/rate - Rate a public indicator
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// We'll store ratings in a simple way by recalculating average
// In a production system, you'd want a separate IndicatorRating table
// to track individual user ratings and prevent duplicate ratings

// POST /api/indicators/:id/rate - Rate a public indicator
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const body = await request.json();
    const { rating } = body;

    // Validate rating
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Invalid rating', message: 'Rating must be a number between 1 and 5' },
        { status: 400 }
      );
    }

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

    // Check if public
    if (indicator.visibility !== 'PUBLIC') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Can only rate public indicators' },
        { status: 403 }
      );
    }

    // Check if user is the owner (can't rate own indicator)
    if (indicator.ownerId === authResult.userId) {
      return NextResponse.json(
        { error: 'Invalid operation', message: 'You cannot rate your own indicator' },
        { status: 400 }
      );
    }

    // Check if user is subscribed (must subscribe before rating)
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
        { error: 'Not subscribed', message: 'You must subscribe to an indicator before rating it' },
        { status: 400 }
      );
    }

    // Calculate new average rating
    // Note: This is a simplified implementation. For accurate ratings,
    // you'd want a separate IndicatorRating table to track individual ratings
    const currentTotal = indicator.rating * indicator.ratingCount;
    const newRatingCount = indicator.ratingCount + 1;
    const newRating = (currentTotal + rating) / newRatingCount;

    // Update indicator rating
    const updatedIndicator = await prisma.indicator.update({
      where: { id: params.id },
      data: {
        rating: newRating,
        ratingCount: newRatingCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Rating submitted successfully',
      indicator: {
        id: updatedIndicator.id,
        name: updatedIndicator.name,
        rating: updatedIndicator.rating,
        ratingCount: updatedIndicator.ratingCount,
      },
    });
  } catch (error) {
    console.error('Error rating indicator:', error);
    return NextResponse.json(
      { error: 'Failed to rate indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
