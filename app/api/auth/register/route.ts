/**
 * Local account registration.
 *
 * Anyone on the network can register, but the account lands in PENDING and
 * cannot reach anything until an admin approves it from /admin. That approval
 * step is what keeps self-service registration safe here.
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { LogSource } from '@prisma/client';

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Name, email and password are all required' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'That does not look like an email address' },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An account with that email already exists' },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        // status defaults to PENDING; an admin approves from /admin
      },
      select: { id: true, email: true, name: true, status: true },
    });

    logger.info(LogSource.API, 'user.register', `New account registered: ${email}`, {
      userId: user.id,
    });

    return NextResponse.json(
      {
        message: 'Account created. An admin needs to approve it before you can sign in.',
        user,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[register] Failed to create account:', error);
    return NextResponse.json(
      { error: 'Could not create the account' },
      { status: 500 }
    );
  }
}
