/**
 * Encryption for stored provider credentials.
 *
 * The wire format is shared with the data-service, which reads these rows in
 * Python: AES-256-GCM, `base64(nonce || ciphertext || tag)` with a 12-byte
 * nonce and 16-byte tag. Node appends the tag manually because
 * `createCipheriv` keeps it separate, while Python's AESGCM returns it already
 * appended — so this file's job is to produce exactly what the other side
 * expects, byte for byte.
 *
 * The key lives in CREDENTIAL_ENCRYPTION_KEY as base64 of 32 bytes and is only
 * ever read server-side. It must never reach the browser, and neither must any
 * decrypted secret: the admin API returns masked values only.
 */
import crypto from 'crypto';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class CredentialCryptoError extends Error {}

function loadKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new CredentialCryptoError(
      'CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with ' +
        '`python scripts/credentials.py genkey` in data-service and add it to .env.'
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new CredentialCryptoError('CREDENTIAL_ENCRYPTION_KEY is not valid base64');
  }

  if (key.length !== KEY_BYTES) {
    throw new CredentialCryptoError(
      `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`
    );
  }
  return key;
}

/** Encrypt a secret for storage. Produces what the Python side reads. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new CredentialCryptoError('refusing to encrypt an empty secret');
  }

  const key = loadKey();
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  // Python's AESGCM expects the tag trailing the ciphertext.
  return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]).toString('base64');
}

/**
 * Recover a secret from storage.
 *
 * Only used to verify a stored value is readable — decrypted secrets are never
 * returned to a client.
 */
export function decryptSecret(stored: string): string {
  if (!stored) {
    throw new CredentialCryptoError('no ciphertext to decrypt');
  }

  const key = loadKey();
  const blob = Buffer.from(stored, 'base64');

  if (blob.length <= NONCE_BYTES + TAG_BYTES) {
    throw new CredentialCryptoError('stored credential is too short to be valid');
  }

  const nonce = blob.subarray(0, NONCE_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(NONCE_BYTES, blob.length - TAG_BYTES);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // GCM is authenticated, so this is either the wrong key or a modified row —
    // both surface here rather than as a provider auth failure days later.
    throw new CredentialCryptoError(
      'stored credential failed authentication — either CREDENTIAL_ENCRYPTION_KEY ' +
        'is wrong or the value was modified'
    );
  }
}

export function isCryptoConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * A hint that identifies a key without revealing it.
 *
 * Enough to tell two keys apart when checking what is configured, useless to
 * anyone who obtains it.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return '••••';
  return `••••${plaintext.slice(-4)}`;
}
