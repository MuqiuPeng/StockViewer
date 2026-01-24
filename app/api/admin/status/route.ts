import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { TicketStatus, UserStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      console.log('Admin status check: No session or user ID');
      return NextResponse.json({ isAdmin: false, reason: 'no_session' });
    }

    console.log('Admin status check for user:', session.user.id, session.user.email);
    const adminStatus = await isAdmin(session.user.id);
    console.log('Admin status result:', adminStatus);

    if (!adminStatus) {
      return NextResponse.json({ isAdmin: false, reason: 'not_admin' });
    }

    // Get pending counts for admin
    const [pendingTickets, pendingUsers] = await Promise.all([
      prisma.ticket.count({
        where: { status: TicketStatus.PENDING },
      }),
      prisma.user.count({
        where: { status: UserStatus.PENDING },
      }),
    ]);

    return NextResponse.json({
      isAdmin: true,
      pendingTickets,
      pendingUsers,
    });
  } catch (error) {
    console.error('Error checking admin status:', error);
    return NextResponse.json({
      isAdmin: false,
      reason: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
