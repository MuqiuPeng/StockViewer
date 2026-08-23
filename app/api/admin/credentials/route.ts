/**
 * Provider credential management. Admin only.
 *
 * Secrets are write-only across this whole API. A stored key is never returned
 * to any client, in any field, at any time — the list shows what a credential
 * is and whether it works, and rotating means supplying a new value rather
 * than reading the old one. That is the difference between managing keys from
 * a browser and publishing them to one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { LogSource, Prisma } from '@prisma/client';
import {
  CredentialCryptoError,
  decryptSecret,
  encryptSecret,
  isCryptoConfigured,
} from '@/lib/credential-crypto';

export const dynamic = 'force-dynamic';

const BUDGET_KINDS = ['requests', 'credits', 'bytes', 'symbols'] as const;
const BUDGET_WINDOWS = ['minute', 'hour', 'day', 'month', 'lifetime'] as const;

interface BudgetInput {
  kind: string;
  limit: number;
  window: string;
}

/** Validate budgets here so a malformed one cannot reach the gateway. */
function parseBudgets(raw: unknown): { budgets: BudgetInput[]; error?: string } {
  if (raw == null) return { budgets: [] };
  if (!Array.isArray(raw)) return { budgets: [], error: 'budgets must be an array' };

  const budgets: BudgetInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return { budgets: [], error: 'each budget must be an object' };
    }
    const { kind, limit, window } = entry as Record<string, unknown>;
    if (typeof kind !== 'string' || !BUDGET_KINDS.includes(kind as never)) {
      return { budgets: [], error: `budget kind must be one of ${BUDGET_KINDS.join(', ')}` };
    }
    if (typeof window !== 'string' || !BUDGET_WINDOWS.includes(window as never)) {
      return { budgets: [], error: `budget window must be one of ${BUDGET_WINDOWS.join(', ')}` };
    }
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0) {
      return { budgets: [], error: 'budget limit must be a non-negative number' };
    }
    budgets.push({ kind, limit: Math.floor(numericLimit), window });
  }
  return { budgets };
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!(await isAdmin(session.user.id))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

// GET /api/admin/credentials — list, without secrets
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const cryptoReady = isCryptoConfigured();

  const rows = await prisma.providerCredential.findMany({
    orderBy: [{ provider: 'asc' }, { priority: 'asc' }, { label: 'asc' }],
  });

  const today = new Date();
  const credentials = rows.map((row) => {
    // Whether the stored value is readable is worth surfacing: a wrong
    // encryption key looks exactly like a broken provider from the outside.
    let readable: boolean | null = null;
    if (cryptoReady) {
      try {
        decryptSecret(row.secretCiphertext);
        readable = true;
      } catch {
        readable = false;
      }
    }

    const expiresInDays = row.validUntil
      ? Math.floor((row.validUntil.getTime() - today.getTime()) / 86_400_000)
      : null;

    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      enabled: row.enabled,
      priority: row.priority,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      expiresInDays,
      budgets: row.budgets,
      notes: row.notes,
      lastUsedAt: row.lastUsedAt,
      updatedAt: row.updatedAt,
      readable,
    };
  });

  return NextResponse.json({
    credentials,
    cryptoConfigured: cryptoReady,
  });
}

// POST /api/admin/credentials — create or replace one
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  if (!isCryptoConfigured()) {
    return NextResponse.json(
      {
        error:
          'CREDENTIAL_ENCRYPTION_KEY is not configured. Generate one with ' +
          '`python scripts/credentials.py genkey` in data-service and add it to .env.',
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const provider = typeof body.provider === 'string' ? body.provider.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const secret = typeof body.secret === 'string' ? body.secret : '';

  if (!provider || !label || !secret) {
    return NextResponse.json(
      { error: 'provider, label and secret are all required' },
      { status: 400 }
    );
  }

  const { budgets, error: budgetError } = parseBudgets(body.budgets);
  if (budgetError) {
    return NextResponse.json({ error: budgetError }, { status: 400 });
  }

  let ciphertext: string;
  try {
    ciphertext = encryptSecret(secret);
  } catch (error) {
    const message =
      error instanceof CredentialCryptoError ? error.message : 'Encryption failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const data = {
    secretCiphertext: ciphertext,
    enabled: body.enabled !== false,
    priority: Number.isFinite(Number(body.priority)) ? Math.floor(Number(body.priority)) : 0,
    validFrom: body.validFrom ? new Date(body.validFrom) : null,
    validUntil: body.validUntil ? new Date(body.validUntil) : null,
    // Prisma's Json input needs a plain JSON value, not a typed array.
    budgets: budgets as unknown as Prisma.InputJsonValue,
    notes: typeof body.notes === 'string' ? body.notes : null,
  };

  const credential = await prisma.providerCredential.upsert({
    where: { provider_label: { provider, label } },
    create: { provider, label, ...data },
    update: data,
    select: { id: true, provider: true, label: true },
  });

  // Recorded without the secret: who changed which credential is worth an
  // audit trail, the value is not.
  logger.info(
    LogSource.API,
    'credential.upsert',
    `Credential ${provider}/${label} stored`,
    { userId: gate.userId, metadata: { provider, label } }
  );

  return NextResponse.json(
    {
      credential,
      message: 'Stored. Restart the data-service for it to take effect.',
    },
    { status: 201 }
  );
}
