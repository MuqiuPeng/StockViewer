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

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
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

/* ── Filesystem confinement ──────────────────────────────────────────────
 *
 * Closing the environment stopped the child reading secrets out of
 * process.env, but not off disk: .env sits at a known path and the strategy
 * can open it. Returning the contents inside a signal reason is the same
 * exfiltration route, one step longer.
 *
 * macOS enforces this in the kernel through sandbox-exec, which needs no root
 * and no container. The profile is allow-by-default with targeted denials
 * rather than deny-by-default: a deny-all profile aborts CPython before it
 * reaches main, and a list of everything pandas and numpy touch would be a
 * list we get wrong on the next release. Naming what must stay unreachable is
 * both shorter and more stable than naming what may be reached.
 *
 * Network is denied outright. The executors do no I/O of their own — data
 * arrives on stdin and results leave on stdout — so nothing legitimate breaks,
 * and it removes the direct route for anything the child does manage to read.
 *
 * .pgdata is on the list because the database files are the database: user
 * password hashes and stored credential ciphertext both live there, and
 * reading them needs no connection and no password.
 */

/** Escape a path for use inside a sandbox profile regex literal. */
function sbRegex(p: string): string {
  return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sandboxProfile(): string {
  const root = process.cwd();
  const home = os.homedir();
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-read*',
    `  (regex #"^${sbRegex(path.join(root, '.env'))}")`,
    `  (regex #"^${sbRegex(path.join(root, 'data-service', '.env'))}")`,
    `  (subpath "${path.join(root, '.pgdata')}")`,
    `  (subpath "${path.join(root, '.git')}")`,
    `  (subpath "${path.join(home, '.ssh')}")`,
    `  (subpath "${path.join(home, '.aws')}")`,
    `  (subpath "${path.join(home, '.gnupg')}")`,
    `  (subpath "${path.join(home, '.config')}")`,
    `  (subpath "${path.join(home, 'Library', 'Keychains')}"))`,
    '(deny network*)',
    '',
  ].join('\n');
}

/**
 * Path to the written profile, or null when confinement is unavailable.
 *
 * Probed once at startup rather than trusted: sandbox-exec is deprecated and
 * could stop working on a future macOS, and discovering that when the first
 * backtest of the day fails would be worse than running without it. If the
 * probe fails the executors still run — unconfined, and saying so.
 */
const sandboxProfilePath: string | null = (() => {
  if (process.platform !== 'darwin') return null;

  try {
    const file = path.join(os.tmpdir(), 'stockviewer-python.sb');
    fs.writeFileSync(file, sandboxProfile(), { mode: 0o600 });

    // Prove it both runs Python and actually denies, so that a profile which
    // silently stopped applying does not read as success.
    const probe = spawnSync(
      'sandbox-exec',
      ['-f', file, process.execPath, '-e',
       `try{require('fs').readFileSync(${JSON.stringify(path.join(process.cwd(), '.env'))});console.log('READABLE')}` +
       `catch(e){console.log(e.code==='EPERM'?'DENIED':'ABSENT')}`],
      { encoding: 'utf8', timeout: 15_000 }
    );
    const verdict = (probe.stdout || '').trim();
    if (probe.status === 0 && (verdict === 'DENIED' || verdict === 'ABSENT')) return file;

    console.warn(
      '[python-child] sandbox-exec did not confine as expected (%s); ' +
        'user Python will run unconfined and can read files this process can read.',
      verdict || probe.stderr?.trim() || `exit ${probe.status}`
    );
    return null;
  } catch (e) {
    console.warn('[python-child] filesystem confinement unavailable:', e);
    return null;
  }
})();

/** Whether user Python is confined, for health endpoints. */
export function pythonSandboxActive(): boolean {
  return sandboxProfilePath !== null;
}

/** Spawn a Python child under the shared environment and confinement policy. */
export function spawnPython(
  executable: string,
  args: string[]
): ChildProcessWithoutNullStreams {
  const [cmd, argv] = sandboxProfilePath
    ? ['sandbox-exec', ['-f', sandboxProfilePath, executable, ...args]]
    : [executable, args];

  return spawn(cmd as string, argv as string[], {
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
