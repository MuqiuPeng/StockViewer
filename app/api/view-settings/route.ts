import { NextResponse } from 'next/server';
import {
  getAllViewSettings,
  createViewSetting,
  updateViewSetting,
  deleteViewSetting,
} from '@/lib/view-settings-storage';

export async function GET() {
  try {
    const settings = getAllViewSettings();
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
    const body = await request.json();
    const { name, enabledIndicators1, enabledIndicators2, constantLines1, constantLines2 } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: true, message: 'Name is required' },
        { status: 400 }
      );
    }

    const setting = createViewSetting({
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
    const body = await request.json();
    const { id, name, enabledIndicators1, enabledIndicators2, constantLines1, constantLines2 } = body;

    if (!id) {
      return NextResponse.json(
        { error: true, message: 'ID is required' },
        { status: 400 }
      );
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (enabledIndicators1 !== undefined) updates.enabledIndicators1 = enabledIndicators1;
    if (enabledIndicators2 !== undefined) updates.enabledIndicators2 = enabledIndicators2;
    if (constantLines1 !== undefined) updates.constantLines1 = constantLines1;
    if (constantLines2 !== undefined) updates.constantLines2 = constantLines2;

    const setting = updateViewSetting(id, updates);

    if (!setting) {
      return NextResponse.json(
        { error: true, message: 'View setting not found' },
        { status: 404 }
      );
    }

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
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: true, message: 'ID is required' },
        { status: 400 }
      );
    }

    const success = deleteViewSetting(id);

    if (!success) {
      return NextResponse.json(
        { error: true, message: 'View setting not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, message: error.message || 'Failed to delete view setting' },
      { status: 500 }
    );
  }
}
