import { createHash } from 'crypto';

/**
 * Compute SHA256 hash of code string
 * Used for indicator versioning and cache invalidation
 */
export function computeCodeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
