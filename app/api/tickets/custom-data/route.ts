/**
 * Custom Data Upload API
 * POST /api/tickets/custom-data - Upload CSV file and create CUSTOM_DATA ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { parseCsvContent } from '@/lib/csv-parser';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

// File size limit: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 100000;

export async function POST(request: NextRequest) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const symbol = formData.get('symbol') as string | null;
    const name = formData.get('name') as string | null;
    const description = formData.get('description') as string | null;

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'Missing file', message: 'CSV file is required' },
        { status: 400 }
      );
    }

    if (!symbol || !symbol.trim()) {
      return NextResponse.json(
        { error: 'Missing symbol', message: 'Stock symbol is required' },
        { status: 400 }
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Missing name', message: 'Stock name is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Invalid file type', message: 'File must be a CSV file' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: 'File too large',
          message: `File size exceeds maximum limit of 10MB (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
        },
        { status: 400 }
      );
    }

    // Read and parse CSV content
    const content = await file.text();
    const parseResult = parseCsvContent(content);

    // Check for parsing errors
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid CSV',
          message: 'CSV validation failed',
          details: {
            errors: parseResult.errors,
            warnings: parseResult.warnings,
          },
        },
        { status: 400 }
      );
    }

    // Check row count limit
    if (parseResult.rowCount > MAX_ROWS) {
      return NextResponse.json(
        {
          error: 'Too many rows',
          message: `CSV contains ${parseResult.rowCount} rows, exceeding the limit of ${MAX_ROWS}`,
        },
        { status: 400 }
      );
    }

    // Check for duplicate pending ticket with same symbol
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        userId,
        type: 'CUSTOM_DATA',
        status: 'PENDING',
        payload: {
          path: ['symbol'],
          equals: symbol.trim().toUpperCase(),
        },
      },
    });

    if (existingTicket) {
      return NextResponse.json(
        {
          error: 'Duplicate ticket',
          message: 'You already have a pending upload request for this symbol',
        },
        { status: 409 }
      );
    }

    // Check if stock with same symbol already exists in custom_upload
    const existingStock = await prisma.stock.findFirst({
      where: {
        symbol: symbol.trim().toUpperCase(),
        dataSource: 'custom_upload',
      },
    });

    if (existingStock) {
      return NextResponse.json(
        {
          error: 'Symbol exists',
          message: `A custom dataset with symbol "${symbol.trim().toUpperCase()}" already exists`,
        },
        { status: 409 }
      );
    }

    // Create ticket with CSV data in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create ticket
      const ticket = await tx.ticket.create({
        data: {
          userId,
          type: 'CUSTOM_DATA',
          payload: {
            symbol: symbol.trim().toUpperCase(),
            name: name.trim(),
            description: description?.trim() || null,
          },
        },
      });

      // Create CSV data blob
      await tx.csvDataBlob.create({
        data: {
          ticketId: ticket.id,
          filename: file.name,
          rowCount: parseResult.rowCount,
          fileSize: file.size,
          data: parseResult.data as unknown as Prisma.InputJsonValue,
          columnMapping: parseResult.columnMapping as Prisma.InputJsonValue,
        },
      });

      return ticket;
    });

    return NextResponse.json({
      success: true,
      message: 'Custom data upload submitted for approval',
      ticket: {
        id: result.id,
        type: result.type,
        status: result.status,
        payload: result.payload,
        createdAt: result.createdAt,
      },
      csvInfo: {
        filename: file.name,
        rowCount: parseResult.rowCount,
        dateRange: parseResult.dateRange,
        columns: Object.keys(parseResult.columnMapping),
        warnings: parseResult.warnings,
      },
    });
  } catch (error) {
    console.error('Error uploading custom data:', error);
    return NextResponse.json(
      {
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
