/**
 * Rotate, enable/disable or delete one credential. Admin only.
 *
 * Rotation takes a new secret; it never reveals the current one. There is no
 * read path for a stored key anywhere in this API by design — a key that can
 * be fetched from a browser is a key that can leak through one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { LogSource } from '@prisma/client';
import {
  CredentialCryptoError,
  encryptSecret,
  isCryptoConfigured,
} from '@/lib/credential-crypto';

export const dynamic = 'force-dynamic';

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

// PATCH /api/admin/credentials/[id] — rotate the secret, or toggle fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const existing = await prisma.providerCredential.findUnique({
    where: { id: params.id },
    select: { id: true, provider: true, label: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.secret === 'string' && body.secret) {
    if (!isCryptoConfigured()) {
      return NextResponse.json(
        { error: 'CREDENTIAL_ENCRYPTION_KEY is not configured' },
        { status: 503 }
      );
    }
    try {
      data.secretCiphertext = encryptSecret(body.secret);
    } catch (error) {
      const message =
        error instanceof CredentialCryptoError ? error.message : 'Encryption failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
  if (Number.isFinite(Number(body.priority))) data.priority = Math.floor(Number(body.priority));
  if ('validUntil' in body) data.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  if ('validFrom' in body) data.validFrom = body.validFrom ? new Date(body.validFrom) : null;
  if (typeof body.notes === 'string') data.notes = body.notes;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await prisma.providerCredential.update({ where: { id: params.id }, data });

  const action = data.secretCiphertext ? 'rotated' : 'updated';
  logger.info(
    LogSource.API,
    'credential.update',
    `Credential ${existing.provider}/${existing.label} ${action}`,
    { userId: gate.userId, metadata: { provider: existing.provider, label: existing.label, action } }
  );

  return NextResponse.json({
    message: `Credential ${action}. Restart the data-service for it to take effect.`,
  });
}

// DELETE /api/admin/credentials/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const existing = await prisma.providerCredential.findUnique({
    where: { id: params.id },
    select: { provider: true, label: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
  }

  await prisma.providerCredential.delete({ where: { id: params.id } });

  logger.warn(
    LogSource.API,
    'credential.delete',
    `Credential ${existing.provider}/${existing.label} deleted`,
    { userId: gate.userId, metadata: { provider: existing.provider, label: existing.label } }
  );

  return NextResponse.json({
    message: 'Deleted. Restart the data-service for it to take effect.',
  });
}
