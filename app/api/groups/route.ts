import { NextResponse } from 'next/server';
import {
  loadGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupById,
} from '@/lib/group-storage';

export const runtime = 'nodejs';

// GET /api/groups - List all groups
export async function GET() {
  try {
    const groups = await loadGroups();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error loading groups:', error);
    return NextResponse.json(
      { error: 'Failed to load groups', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/groups - Create a new group
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, datasetNames } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const group = await createGroup({
      name: name.trim(),
      description: description?.trim() || '',
      datasetNames: Array.isArray(datasetNames) ? datasetNames : [],
    });

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Failed to create group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/groups - Update a group
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, description, datasetNames } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'id is required' },
        { status: 400 }
      );
    }

    const updates: any = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json(
          { error: 'Invalid input', message: 'name must be a non-empty string' },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description?.trim() || '';
    }
    if (datasetNames !== undefined) {
      if (!Array.isArray(datasetNames)) {
        return NextResponse.json(
          { error: 'Invalid input', message: 'datasetNames must be an array' },
          { status: 400 }
        );
      }
      updates.datasetNames = datasetNames;
    }

    const group = await updateGroup(id, updates);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json(
      { error: 'Failed to update group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/groups - Delete a group
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'id is required' },
        { status: 400 }
      );
    }

    const deleted = await deleteGroup(id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { error: 'Failed to delete group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

