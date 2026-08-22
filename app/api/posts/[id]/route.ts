/**
 * Single Post API
 * GET /api/posts/:id - Get a specific post
 * DELETE /api/posts/:id - Delete a post (owner only)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { LogSource } from '@prisma/client';

export const runtime = 'nodejs';

// GET /api/posts/:id - Get a specific post
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const post = await prisma.post.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, image: true } },
        images: { orderBy: { position: 'asc' } },
        attachments: true,
      },
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      post: {
        id: post.id,
        user: post.user,
        content: post.content,
        images: post.images,
        attachments: post.attachments.map(a => ({
          id: a.id,
          type: a.type,
          originalId: a.originalId,
          originalName: a.originalName,
          snapshot: a.snapshot,
          dependencies: a.dependencies,
        })),
        createdAt: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/posts/:id - Delete a post
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const post = await prisma.post.findUnique({
      where: { id: params.id },
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    if (post.userId !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'You can only delete your own posts' },
        { status: 403 }
      );
    }

    await prisma.post.delete({
      where: { id: params.id },
    });

    logger.info(LogSource.API, 'delete_post', 'Deleted post', { userId, metadata: { postId: params.id } });

    return NextResponse.json({
      success: true,
      message: 'Post deleted',
    });
  } catch (error) {
    logger.error(LogSource.API, 'delete_post', 'Failed to delete post', { error, metadata: { postId: params.id } });
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
