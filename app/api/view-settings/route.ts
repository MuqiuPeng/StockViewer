import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { ViewSetting } from '@/lib/view-settings-storage';

export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const settings = await authResult.storage.getJsonStore<ViewSetting>('viewSettings').getAll();
    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, message: error.message || 'Failed to load view settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<ViewSetting>('viewSettings');

    const body = await request.json();
    const { name, enabledIndicators1, enabledIndicators2, constantLines1, constantLines2 } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: true, message: 'Name is required' },
        { status: 400 }
      );
    }

    const setting = await store.create({
      name: name.trim(),
      enabledIndicators1: enabledIndicators1 || [],
      enabledIndicators2: enabledIndicators2 || [],
      constantLines1: constantLines1 || [],
      constantLines2: constantLines2 || [],
    });

    return NextResponse.json({ setting });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, message: error.message || 'Failed to create view setting' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<ViewSetting>('viewSettings');

    const body = await request.json();
    const { id, name, enabledIndicators1, enabledIndicators2, constantLines1, constantLines2 } = body;

    if (!id) {
      return NextResponse.json(
        { error: true, message: 'ID is required' },
        { status: 400 }
      );
    }

    // Check if exists
    const existing = await store.getById(id);
    if (!existing) {
      return NextResponse.json(
        { error: true, message: 'View setting not found' },
        { status: 404 }
      );
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (enabledIndicators1 !== undefined) updates.enabledIndicators1 = enabledIndicators1;
    if (enabledIndicators2 !== undefined) updates.enabledIndicators2 = enabledIndicators2;
    if (constantLines1 !== undefined) updates.constantLines1 = constantLines1;
    if (constantLines2 !== undefined) updates.constantLines2 = constantLines2;

    const setting = await store.update(id, updates);

    return NextResponse.json({ setting });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, message: error.message || 'Failed to update view setting' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<ViewSetting>('viewSettings');

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: true, message: 'ID is required' },
        { status: 400 }
      );
    }

    // Check if exists
    const existing = await store.getById(id);
    if (!existing) {
      return NextResponse.json(
        { error: true, message: 'View setting not found' },
        { status: 404 }
      );
    }

    await store.delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, message: error.message || 'Failed to delete view setting' },
      { status: 500 }
    );
  }
}
