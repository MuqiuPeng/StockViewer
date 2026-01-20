import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { TicketStatus, UserStatus } from '@prisma/client';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ isAdmin: false });
    }

    const adminStatus = await isAdmin(session.user.id);

    if (!adminStatus) {
      return NextResponse.json({ isAdmin: false });
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
    return NextResponse.json({ isAdmin: false });
  }
}
