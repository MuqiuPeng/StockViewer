/**
 * Shared spawn policy for the Python executors.
 *
 * Three routes run user-authored Python: backtests, strategy validation and
 * indicator simulation. Executing that code is the product — people write
 * strategies and the point is to run them — so the question is not whether to
 * execute it but what it should be able to reach while it does.
 *
 * Two things it should not reach, both of which it could before this module.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * Environment for a Python child.
 *
 * `spawn` inherits `process.env` when no `env` is given, and in a Next.js
 * server that environment holds everything from .env and .env.local:
 * CREDENTIAL_ENCRYPTION_KEY, AUTH_SECRET, DATABASE_URL, CRON_SECRET. A
 * strategy is executed with `exec()` against an unrestricted namespace, so
 * `os.environ['CREDENTIAL_ENCRYPTION_KEY']` returned inside a signal reason
 * would have read out the key that the whole encrypted credential store
 * exists to protect.
 *
 * So the child gets an allowlist instead of an inheritance. The executors
 * read no environment variables at all — checked, not assumed — which is why
 * this can be as short as it is: everything here is for the interpreter, not
 * for our code.
 *
 * HOME is redirected to a scratch directory rather than passed through.
 * Python and its libraries write caches under it, so it cannot simply be
 * dropped, but the real one is the path to ~/.aws, ~/.ssh and ~/.config.
 */
export function pythonChildEnv(): NodeJS.ProcessEnv {
  const scratchHome = path.join(os.tmpdir(), 'stockviewer-python-home');

  return {
    // Not a secret, and Next.js's ProcessEnv typing requires it.
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: scratchHome,
    TMPDIR: os.tmpdir(),
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    // Results cross the boundary as JSON on stdout; a non-UTF-8 default
    // encoding corrupts any non-ASCII symbol name on the way out.
    PYTHONIOENCODING: 'utf-8',
    PYTHONDONTWRITEBYTECODE: '1',
  };
}

/**
 * Cap on Python processes running at once.
 *
 * Every request used to spawn immediately with nothing counting how many were
 * already running. Each one imports pandas and numpy — on the order of 100MB
 * resident before it reads its first bar — and the timeout is five minutes, so
 * slow backtests overlap rather than queue. That was survivable when this ran
 * on one developer's machine and stops being survivable now that it serves a
 * LAN: a handful of people starting backtests together is enough to put the
 * host into swap, which slows every request including the ones that would
 * otherwise have finished.
 *
 * The number is deliberately smaller than the core count. These processes are
 * CPU-bound, and the Node server and Postgres need cores too.
 */
const MAX_CONCURRENT = Math.max(2, Math.floor((os.cpus().length || 4) / 2));

/** How long a request waits for a slot before giving up. */
const QUEUE_TIMEOUT_MS = 60_000;

let active = 0;
const waiting: Array<{ resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];

export class PythonBusyError extends Error {
  constructor() {
    super(
      `Too many analyses are already running (limit ${MAX_CONCURRENT}). ` +
        `Please try again in a moment.`
    );
    this.name = 'PythonBusyError';
  }
}

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const entry = {
      resolve,
      reject,
      // Without this a queued request holds a connection for as long as the
      // backlog takes to drain, which under load is unbounded. Failing with a
      // clear message beats a request that never answers.
      timer: setTimeout(() => {
        const i = waiting.indexOf(entry);
        if (i >= 0) waiting.splice(i, 1);
        reject(new PythonBusyError());
      }, QUEUE_TIMEOUT_MS),
    };
    waiting.push(entry);
  });
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // hands over the slot; `active` stays as it is
    return;
  }
  active = Math.max(0, active - 1);
}

/**
 * Run `fn` holding one of the Python slots.
 *
 * The slot is released in `finally` so that a crash, a timeout or a rejected
 * promise frees it. A leak here is worse than the original problem: the cap
 * would ratchet down to zero and every later request would time out queued.
 */
export async function withPythonSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Spawn a Python child under the shared environment policy. */
export function spawnPython(
  executable: string,
  args: string[]
): ChildProcessWithoutNullStreams {
  return spawn(executable, args, {
    stdio: ['pipe', 'pipe', 'pipe'] as const,
    env: pythonChildEnv(),
  });
}

/** Current occupancy, for health endpoints. */
export function pythonSlotStats() {
  return { active, waiting: waiting.length, limit: MAX_CONCURRENT };
}

/**
 * True when a request failed only because the host was saturated.
 *
 * Routes map this to 503 rather than 500: nothing is wrong with the request
 * and repeating it later will work, which is the opposite of what a 500 tells
 * a client.
 */
export function isPythonBusy(error: unknown): boolean {
  return error instanceof PythonBusyError;
}
