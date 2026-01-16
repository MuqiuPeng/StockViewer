import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { StockGroup } from '@/lib/group-storage';

export const runtime = 'nodejs';

// GET /api/groups/[id] - Get a specific group
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const group = await authResult.storage.getJsonStore<StockGroup>('groups').getById(params.id);
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
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<StockGroup>('groups');

    const body = await request.json();
    const { name, description, datasetNames } = body;

    // Check if group exists and if it's a data source group
    const existingGroup = await store.getById(params.id);
    if (!existingGroup) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }
    if (existingGroup.isDataSource) {
      return NextResponse.json(
        { error: 'Cannot edit data source group', message: 'Data source groups are auto-generated and cannot be modified' },
        { status: 403 }
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

    const group = await store.update(params.id, updates);
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
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<StockGroup>('groups');

    // Check if group exists and if it's a data source group
    const existingGroup = await store.getById(params.id);
    if (!existingGroup) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }
    if (existingGroup.isDataSource) {
      return NextResponse.json(
        { error: 'Cannot delete data source group', message: 'Data source groups are auto-generated and cannot be deleted' },
        { status: 403 }
      );
    }

    await store.delete(params.id);
    return NextResponse.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { error: 'Failed to delete group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
