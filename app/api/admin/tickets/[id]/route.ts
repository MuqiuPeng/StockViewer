/**
 * Admin Ticket Review API
 * GET /api/admin/tickets/:id - Get ticket details (admin only)
 * PATCH /api/admin/tickets/:id - Review ticket (approve/reject)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { isAdmin } from '@/lib/admin';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/tickets/:id - Get ticket details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Check admin permission
    const admin = await isAdmin(userId);
    if (!admin) {
      return NextResponse.json(
        { error: 'Access denied', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
        reviewer: {
          select: { name: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ticket', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/tickets/:id - Review ticket
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Check admin permission
    const admin = await isAdmin(userId);
    if (!admin) {
      return NextResponse.json(
        { error: 'Access denied', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { action, note } = body;

    // Validate action
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action', message: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Get ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    if (ticket.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Ticket already reviewed', message: `Ticket is already ${ticket.status}` },
        { status: 400 }
      );
    }

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';

    // Update ticket
    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: {
        status: newStatus,
        reviewedBy: userId,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    // Handle approved tickets based on type
    let actionResult = null;

    if (action === 'approve') {
      if (ticket.type === 'FULL_REFRESH') {
        // Full refresh of existing stock
        const payload = ticket.payload as { stockId: string; symbol: string; dataSource: string };

        try {
          actionResult = await performFullRefresh(payload.stockId, payload.symbol, payload.dataSource);
        } catch (error) {
          console.error('Full refresh failed:', error);
          actionResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      } else if (ticket.type === 'CUSTOM_DATA') {
        // Import custom CSV data
        try {
          actionResult = await importCustomData(ticket.id, ticket.userId);
        } catch (error) {
          console.error('Custom data import failed:', error);
          actionResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      } else if (ticket.type === 'DELETE_DATASET') {
        // Delete custom dataset
        try {
          actionResult = await deleteCustomDataset(ticket.payload as { stockId: string; symbol: string });
        } catch (error) {
          console.error('Dataset deletion failed:', error);
          actionResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Ticket ${action}d successfully`,
      ticket: {
        id: updatedTicket.id,
        type: updatedTicket.type,
        status: updatedTicket.status,
        reviewedAt: updatedTicket.reviewedAt,
      },
      actionResult,
    });
  } catch (error) {
    console.error('Error reviewing ticket:', error);
    return NextResponse.json(
      { error: 'Failed to review ticket', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Perform full refresh of stock data
 */
async function performFullRefresh(
  stockId: string,
  symbol: string,
  dataSource: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { spawn } = await import('child_process');

  // Build Python code to fetch data
  const pythonCode = `
import akshare as ak
import json

symbol = "${symbol}"
data_source = "${dataSource}"

try:
    stock_name = None

    if data_source == "stock_zh_a_hist":
        df = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date="19900101", end_date="21001231", adjust="qfq")
        try:
            info_df = ak.stock_individual_info_em(symbol=symbol)
            if info_df is not None and len(info_df) > 0:
                name_row = info_df[info_df['item'] == '股票简称']
                if len(name_row) > 0:
                    stock_name = name_row.iloc[0]['value']
        except:
            pass
    elif data_source == "stock_hk_hist":
        df = ak.stock_hk_hist(symbol=symbol, period="daily", start_date="19900101", end_date="21001231", adjust="qfq")
    elif data_source == "stock_us_hist":
        df = ak.stock_us_hist(symbol=symbol, period="daily", start_date="19900101", end_date="21001231", adjust="qfq")
    elif data_source == "fund_etf_hist_em":
        df = ak.fund_etf_hist_em(symbol=symbol, period="daily", start_date="19900101", end_date="21001231", adjust="qfq")
    elif data_source == "index_zh_a_hist":
        df = ak.index_zh_a_hist(symbol=symbol, period="daily", start_date="19900101", end_date="21001231")
    else:
        raise ValueError(f"Unsupported data source: {data_source}")

    column_map = {
        "日期": "date", "开盘": "open", "收盘": "close", "最高": "high", "最低": "low",
        "成交量": "volume", "成交额": "turnover", "振幅": "amplitude",
        "涨跌幅": "change_pct", "涨跌额": "change_amount", "换手率": "turnover_rate",
    }
    df = df.rename(columns=column_map)
    if "date" in df.columns:
        df["date"] = df["date"].astype(str)

    records = df.to_dict(orient="records")
    print(json.dumps({
        "success": True,
        "rowCount": len(records),
        "firstDate": records[0]["date"] if records else None,
        "lastDate": records[-1]["date"] if records else None,
        "stockName": stock_name,
        "data": records
    }))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

  // Execute Python
  const result = await new Promise<any>((resolve) => {
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python3';
    const python = spawn(pythonExecutable, ['-c', pythonCode]);
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: `Python exited with code ${code}: ${stderr}` });
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        resolve({ success: false, error: `Failed to parse output: ${stdout}` });
      }
    });

    python.on('error', (err) => {
      resolve({ success: false, error: `Failed to spawn Python: ${err.message}` });
    });
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const records = result.data;
  if (!records || records.length === 0) {
    return { success: false, error: 'No data returned from API' };
  }

  // Get stock
  const stock = await prisma.stock.findUnique({
    where: { id: stockId },
  });

  if (!stock) {
    return { success: false, error: 'Stock not found' };
  }

  // Full refresh: delete all existing data
  await prisma.stockPrice.deleteMany({
    where: { stockId },
  });

  await prisma.stockIndicator.deleteMany({
    where: { stockId },
  });

  // Insert new data
  const batchSize = 1000;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await prisma.stockPrice.createMany({
      data: batch.map((r: any) => ({
        stockId,
        date: new Date(r.date),
        open: new Prisma.Decimal(r.open || 0),
        high: new Prisma.Decimal(r.high || 0),
        low: new Prisma.Decimal(r.low || 0),
        close: new Prisma.Decimal(r.close || 0),
        volume: BigInt(Math.round(r.volume || 0)),
        turnover: r.turnover !== undefined ? new Prisma.Decimal(r.turnover) : null,
        amplitude: r.amplitude !== undefined ? new Prisma.Decimal(r.amplitude) : null,
        changePct: r.change_pct !== undefined ? new Prisma.Decimal(r.change_pct) : null,
        changeAmount: r.change_amount !== undefined ? new Prisma.Decimal(r.change_amount) : null,
        turnoverRate: r.turnover_rate !== undefined ? new Prisma.Decimal(r.turnover_rate) : null,
      })),
      skipDuplicates: true,
    });
  }

  // Update stock metadata
  await prisma.stock.update({
    where: { id: stockId },
    data: {
      name: result.stockName || stock.name,
      firstDate: result.firstDate ? new Date(result.firstDate) : null,
      lastDate: result.lastDate ? new Date(result.lastDate) : null,
      rowCount: records.length,
      lastUpdate: new Date(),
    },
  });

  return {
    success: true,
    message: `Full refresh completed: ${records.length} records imported`,
  };
}

/**
 * Import custom CSV data from ticket
 */
async function importCustomData(
  ticketId: string,
  submitterUserId: string
): Promise<{ success: boolean; message?: string; error?: string; stockId?: string }> {
  // Get ticket with CSV data
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { csvData: true },
  });

  if (!ticket) {
    return { success: false, error: 'Ticket not found' };
  }

  if (!ticket.csvData) {
    return { success: false, error: 'No CSV data found for this ticket' };
  }

  const payload = ticket.payload as { symbol: string; name: string; description?: string };
  const csvData = ticket.csvData;
  const records = csvData.data as Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover?: number;
    amplitude?: number;
    changePct?: number;
    changeAmount?: number;
    turnoverRate?: number;
  }>;

  if (!records || records.length === 0) {
    return { success: false, error: 'No data records in CSV' };
  }

  // Create stock and import data in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create stock record
    const stock = await tx.stock.create({
      data: {
        symbol: payload.symbol,
        name: payload.name,
        dataSource: 'custom_upload',
        category: 'custom',
        firstDate: new Date(records[0].date),
        lastDate: new Date(records[records.length - 1].date),
        rowCount: records.length,
        lastUpdate: new Date(),
      },
    });

    // Insert price data in batches
    const batchSize = 1000;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await tx.stockPrice.createMany({
        data: batch.map((r) => ({
          stockId: stock.id,
          date: new Date(r.date),
          open: new Prisma.Decimal(r.open),
          high: new Prisma.Decimal(r.high),
          low: new Prisma.Decimal(r.low),
          close: new Prisma.Decimal(r.close),
          volume: BigInt(Math.round(r.volume)),
          turnover: r.turnover !== undefined ? new Prisma.Decimal(r.turnover) : null,
          amplitude: r.amplitude !== undefined ? new Prisma.Decimal(r.amplitude) : null,
          changePct: r.changePct !== undefined ? new Prisma.Decimal(r.changePct) : null,
          changeAmount: r.changeAmount !== undefined ? new Prisma.Decimal(r.changeAmount) : null,
          turnoverRate: r.turnoverRate !== undefined ? new Prisma.Decimal(r.turnoverRate) : null,
        })),
        skipDuplicates: true,
      });
    }

    // Add stock to submitter's collection
    await tx.userStock.create({
      data: {
        userId: submitterUserId,
        stockId: stock.id,
      },
    });

    // Delete CSV data blob (no longer needed)
    await tx.csvDataBlob.delete({
      where: { ticketId },
    });

    return stock;
  });

  return {
    success: true,
    message: `Custom data imported: ${records.length} records for ${payload.symbol}`,
    stockId: result.id,
  };
}

/**
 * Delete custom dataset
 */
async function deleteCustomDataset(
  payload: { stockId: string; symbol: string }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const stock = await prisma.stock.findUnique({
    where: { id: payload.stockId },
  });

  if (!stock) {
    return { success: false, error: 'Dataset not found (may have already been deleted)' };
  }

  if (stock.dataSource !== 'custom_upload') {
    return { success: false, error: 'Can only delete custom uploaded datasets' };
  }

  // Delete the stock (cascade will handle price data, user stocks, etc.)
  // SharePosts will have stockId set to null due to SetNull relation
  await prisma.stock.delete({
    where: { id: payload.stockId },
  });

  return {
    success: true,
    message: `Dataset "${payload.symbol}" deleted successfully`,
  };
}
