/**
 * Teams API
 * GET /api/teams - List user's teams (owned + member)
 * POST /api/teams - Create new team
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/teams - List user's teams
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Get teams where user is owner
    const ownedTeams = await prisma.team.findMany({
      where: { ownerId: userId },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
        _count: { select: { members: true, messages: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Get teams where user is a member (but not owner)
    const memberTeams = await prisma.team.findMany({
      where: {
        members: { some: { userId } },
        ownerId: { not: userId },
      },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
        _count: { select: { members: true, messages: true } },
      },
      orderBy: { name: 'asc' },
    });

    const teams = [
      ...ownedTeams.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isOwner: true,
        owner: t.owner,
        memberCount: t._count.members,
        messageCount: t._count.messages,
        members: t.members.map(m => m.user),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      ...memberTeams.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isOwner: false,
        owner: t.owner,
        memberCount: t._count.members,
        messageCount: t._count.messages,
        members: t.members.map(m => m.user),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    ];

    return NextResponse.json({ teams });
  } catch (error) {
    console.error('Error loading teams:', error);
    return NextResponse.json(
      { error: 'Failed to load teams', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/teams - Create new team
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'name is required' },
        { status: 400 }
      );
    }

    // Create the team
    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        isOwner: true,
        owner: team.owner,
        memberCount: 0,
        messageCount: 0,
        members: [],
        createdAt: team.createdAt.toISOString(),
        updatedAt: team.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json(
      { error: 'Failed to create team', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
