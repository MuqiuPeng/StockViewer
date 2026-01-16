import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { StockGroup } from '@/lib/group-storage';
import type { DatasetMetadata } from '@/lib/dataset-metadata';

export const runtime = 'nodejs';

// Helper function to sync data source groups
async function syncDataSourceGroups(
  groupStore: any,
  datasetStore: any
): Promise<void> {
  const datasets = await datasetStore.getAll() as DatasetMetadata[];
  const groups = await groupStore.getAll() as StockGroup[];

  // Get all unique data sources
  const dataSources = new Set<string>();
  for (const dataset of datasets) {
    if (dataset.dataSource) {
      dataSources.add(dataset.dataSource);
    }
  }

  // Create/update data source groups
  for (const dataSource of dataSources) {
    const datasetNames = datasets
      .filter(d => d.dataSource === dataSource)
      .map(d => d.name);

    const existingGroup = groups.find(
      g => g.isDataSource && g.dataSourceName === dataSource
    );

    if (existingGroup) {
      // Update if datasets changed
      if (JSON.stringify(existingGroup.datasetNames.sort()) !== JSON.stringify(datasetNames.sort())) {
        await groupStore.update(existingGroup.id, { datasetNames });
      }
    } else {
      // Create new data source group
      await groupStore.create({
        name: `[${dataSource}]`,
        description: `Auto-generated group for ${dataSource} data source`,
        datasetNames,
        isDataSource: true,
        dataSourceName: dataSource,
      });
    }
  }

  // Remove data source groups that no longer have a corresponding data source
  for (const group of groups) {
    if (group.isDataSource && group.dataSourceName && !dataSources.has(group.dataSourceName)) {
      await groupStore.delete(group.id);
    }
  }
}

// GET /api/groups - List all groups
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const groupStore = authResult.storage.getJsonStore<StockGroup>('groups');
    const datasetStore = authResult.storage.getJsonStore<DatasetMetadata>('datasetMetadata');

    // Sync data source groups before returning
    await syncDataSourceGroups(groupStore, datasetStore);

    const groups = await groupStore.getAll();
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
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<StockGroup>('groups');

    const body = await request.json();
    const { name, description, datasetNames } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const group = await store.create({
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
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<StockGroup>('groups');

    const body = await request.json();
    const { id, name, description, datasetNames } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'id is required' },
        { status: 400 }
      );
    }

    // Check if this is a data source group (auto-generated, cannot be edited)
    const existingGroup = await store.getById(id);
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

    const group = await store.update(id, updates);
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
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<StockGroup>('groups');

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'id is required' },
        { status: 400 }
      );
    }

    // Check if this is a data source group (auto-generated, cannot be deleted)
    const existingGroup = await store.getById(id);
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

    await store.delete(id);
    return NextResponse.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { error: 'Failed to delete group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
