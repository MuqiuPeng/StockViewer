/**
 * Import job status API
 * GET /api/stocks/import/:jobId - Get import job status
 * DELETE /api/stocks/import/:jobId - Cancel/delete an import job
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/stocks/import/:jobId - Get import job status
export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const job = await prisma.dataImportJob.findUnique({
      where: { id: params.jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Import job not found' },
        { status: 404 }
      );
    }

    // Get associated stock if completed
    let stock = null;
    if (job.status === 'COMPLETED') {
      stock = await prisma.stock.findFirst({
        where: {
          symbol: job.symbol,
          dataSource: job.dataSource,
        },
        select: {
          id: true,
          symbol: true,
          name: true,
          dataSource: true,
          rowCount: true,
          firstDate: true,
          lastDate: true,
        },
      });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        symbol: job.symbol,
        dataSource: job.dataSource,
        status: job.status,
        progress: job.progress,
        message: job.message,
        errorMessage: job.errorMessage,
        retryCount: job.retryCount,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      },
      stock,
    });
  } catch (error) {
    console.error('Error getting import job:', error);
    return NextResponse.json(
      { error: 'Failed to get import job', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/stocks/import/:jobId - Cancel/delete an import job
export async function DELETE(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const job = await prisma.dataImportJob.findUnique({
      where: { id: params.jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Import job not found' },
        { status: 404 }
      );
    }

    // Can only cancel pending jobs
    if (job.status === 'PROCESSING') {
      return NextResponse.json(
        { error: 'Cannot cancel job', message: 'Job is currently processing' },
        { status: 400 }
      );
    }

    // Delete the job
    await prisma.dataImportJob.delete({
      where: { id: params.jobId },
    });

    return NextResponse.json({
      success: true,
      message: 'Import job deleted',
    });
  } catch (error) {
    console.error('Error deleting import job:', error);
    return NextResponse.json(
      { error: 'Failed to delete import job', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/stocks/import/:jobId - Retry a failed import job
export async function POST(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const job = await prisma.dataImportJob.findUnique({
      where: { id: params.jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Import job not found' },
        { status: 404 }
      );
    }

    // Can only retry failed jobs
    if (job.status !== 'FAILED') {
      return NextResponse.json(
        { error: 'Cannot retry job', message: `Job status is ${job.status}, can only retry FAILED jobs` },
        { status: 400 }
      );
    }

    // Reset job to pending
    await prisma.dataImportJob.update({
      where: { id: params.jobId },
      data: {
        status: 'PENDING',
        progress: 0,
        message: 'Retrying import...',
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      },
    });

    // Trigger import (in production, this would be a queue worker)
    // For now, redirect to the import endpoint
    return NextResponse.json({
      success: true,
      message: 'Import job queued for retry',
      status: 'PENDING',
    });
  } catch (error) {
    console.error('Error retrying import job:', error);
    return NextResponse.json(
      { error: 'Failed to retry import job', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
