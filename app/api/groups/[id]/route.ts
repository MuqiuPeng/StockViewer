import { NextResponse } from 'next/server';
import { getGroupById, updateGroup, deleteGroup } from '@/lib/group-storage';

export const runtime = 'nodejs';

// GET /api/groups/[id] - Get a specific group
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const group = await getGroupById(params.id);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ group });
  } catch (error) {
    console.error('Error getting group:', error);
    return NextResponse.json(
      { error: 'Failed to get group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/groups/[id] - Update a specific group
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, description, datasetNames } = body;

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

    const group = await updateGroup(params.id, updates);
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

// DELETE /api/groups/[id] - Delete a specific group
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await deleteGroup(params.id);
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

