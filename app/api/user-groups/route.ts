/**
 * User Groups API
 * GET /api/user-groups - List user's groups (owned + member)
 * POST /api/user-groups - Create new group
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/user-groups - List user's groups
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Get groups where user is owner
    const ownedGroups = await prisma.userGroup.findMany({
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

    // Get groups where user is a member (but not owner)
    const memberGroups = await prisma.userGroup.findMany({
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

    const groups = [
      ...ownedGroups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        isOwner: true,
        owner: g.owner,
        memberCount: g._count.members,
        messageCount: g._count.messages,
        members: g.members.map(m => m.user),
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      })),
      ...memberGroups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        isOwner: false,
        owner: g.owner,
        memberCount: g._count.members,
        messageCount: g._count.messages,
        members: g.members.map(m => m.user),
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      })),
    ];

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error loading user groups:', error);
    return NextResponse.json(
      { error: 'Failed to load groups', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/user-groups - Create new group
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

    // Create the group
    const group = await prisma.userGroup.create({
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
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        isOwner: true,
        owner: group.owner,
        memberCount: 0,
        messageCount: 0,
        members: [],
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating user group:', error);
    return NextResponse.json(
      { error: 'Failed to create group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
