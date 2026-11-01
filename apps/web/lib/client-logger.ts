/**
 * Client-side logging utility
 * POSTs log entries to /api/admin/logs/ingest.
 * Silently swallows failures so logging never blocks the user experience.
 */

function sendLog(
  level: 'INFO' | 'ERROR' | 'WARN',
  action: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  fetch('/api/admin/logs/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, action, message, metadata }),
  }).catch(() => {
    // silently ignore logging failures
  });
}

export function logAction(
  action: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  sendLog('INFO', action, message, metadata);
}

export function logWarning(
  action: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  sendLog('WARN', action, message, metadata);
}

export function logError(
  action: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  sendLog('ERROR', action, message, metadata);
}
