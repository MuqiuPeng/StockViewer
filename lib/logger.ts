/**
 * Server-side logging utility
 * Writes logs to the SystemLog database table via Prisma.
 * Fire-and-forget: callers don't need to await, failures fall back to console.error.
 */

import { prisma } from './prisma';
import { LogLevel, LogSource, Prisma } from '@prisma/client';

interface LogOptions {
  userId?: string;
  metadata?: Record<string, unknown>;
  /** Optional Error object — stack trace will be captured automatically */
  error?: Error | unknown;
  /** Optional request URL for API context */
  requestUrl?: string;
  /** Optional HTTP method */
  method?: string;
}

function buildMetadata(opts?: LogOptions): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!opts) return Prisma.DbNull;

  const meta: Record<string, unknown> = { ...(opts.metadata || {}) };

  // Capture stack trace from Error objects
  if (opts.error) {
    if (opts.error instanceof Error) {
      meta.errorName = opts.error.name;
      meta.errorMessage = opts.error.message;
      meta.stack = opts.error.stack;
    } else {
      meta.errorRaw = String(opts.error);
    }
  }

  // Add request context
  if (opts.requestUrl) meta.requestUrl = opts.requestUrl;
  if (opts.method) meta.method = opts.method;

  return Object.keys(meta).length > 0
    ? (meta as Prisma.InputJsonValue)
    : Prisma.DbNull;
}

function log(
  level: LogLevel,
  source: LogSource,
  action: string,
  message: string,
  opts?: LogOptions,
): void {
  prisma.systemLog
    .create({
      data: {
        level,
        source,
        action,
        message,
        userId: opts?.userId ?? null,
        metadata: buildMetadata(opts),
      },
    })
    .catch((err) => {
      console.error(`[logger] Failed to write log: ${err}`);
    });
}

export const logger = {
  info(source: LogSource, action: string, message: string, opts?: LogOptions) {
    log(LogLevel.INFO, source, action, message, opts);
  },
  warn(source: LogSource, action: string, message: string, opts?: LogOptions) {
    log(LogLevel.WARN, source, action, message, opts);
  },
  error(source: LogSource, action: string, message: string, opts?: LogOptions) {
    log(LogLevel.ERROR, source, action, message, opts);
  },
};
