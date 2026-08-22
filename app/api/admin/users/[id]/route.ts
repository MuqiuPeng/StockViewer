import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdmin, isSuperAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { UserStatus, LogSource } from '@prisma/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/users/:id - Update user status or admin flag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminStatus = await isAdmin(session.user.id);
    if (!adminStatus) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, isAdmin: setAdmin, reviewNote } = body as {
      status?: UserStatus;
      isAdmin?: boolean;
      reviewNote?: string;
    };

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        accounts: {
          where: { provider: 'github' },
          select: { providerAccountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if target user is super admin
    const targetIsSuperAdmin = await isSuperAdmin(id);

    // Prevent changing super admin's status or admin flag
    if (targetIsSuperAdmin && (status !== undefined || setAdmin === false)) {
      return NextResponse.json(
        { error: 'Cannot modify super admin' },
        { status: 400 }
      );
    }

    // Prevent admin from changing their own status (but can change their admin flag if not super admin)
    if (user.id === session.user.id && status !== undefined) {
      return NextResponse.json(
        { error: 'Cannot change your own status' },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: {
      status?: UserStatus;
      isAdmin?: boolean;
      statusReviewedBy?: string;
      statusReviewedAt?: Date;
      statusReviewNote?: string | null;
    } = {};

    if (status !== undefined) {
      if (!Object.values(UserStatus).includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be PENDING, APPROVED, or REJECTED' },
          { status: 400 }
        );
      }
      updateData.status = status;
      // Record reviewer info
      updateData.statusReviewedBy = session.user.id;
      updateData.statusReviewedAt = new Date();
      updateData.statusReviewNote = reviewNote || null;
    }

    if (setAdmin !== undefined) {
      // Only super admin can grant/revoke admin status
      const callerIsSuperAdmin = await isSuperAdmin(session.user.id);
      if (!callerIsSuperAdmin) {
        return NextResponse.json(
          { error: 'Only super admin can change admin status' },
          { status: 403 }
        );
      }
      updateData.isAdmin = setAdmin;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        status: true,
        isAdmin: true,
        createdAt: true,
        statusReviewedAt: true,
        statusReviewNote: true,
        statusReviewer: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    logger.info(LogSource.API, 'admin_update_user', 'Updated user', { userId: session.user.id, metadata: { targetUserId: id, status, isAdmin: setAdmin } });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/:id - Delete user and their sessions
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminStatus = await isAdmin(session.user.id);
    if (!adminStatus) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent deleting super admin
    const targetIsSuperAdmin = await isSuperAdmin(id);
    if (targetIsSuperAdmin) {
      return NextResponse.json(
        { error: 'Cannot delete super admin' },
        { status: 400 }
      );
    }

    // Prevent deleting yourself
    if (user.id === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot delete yourself' },
        { status: 400 }
      );
    }

    // Delete user (cascades to sessions, accounts, etc.)
    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
