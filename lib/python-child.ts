/**
 * Shared spawn policy for the Python executors.
 *
 * Three routes run user-authored Python: backtests, strategy validation and
 * indicator simulation. Executing that code is the product — people write
 * strategies and the point is to run them — so the question is not whether to
 * execute it but what it should be able to reach while it does.
 *
 * Three things it should not reach, none of which were closed before: the
 * server's environment, the files holding secrets, and the network.
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/* ── What must stay unreachable ──────────────────────────────────────────
 *
 * One list, three enforcers: the in-process guard reads it from the
 * environment, the macOS profile is generated from it, and the Linux mounts
 * are built from it. Keeping it in one place is what stops the layers from
 * drifting into disagreeing about what is protected.
 *
 * It is a deny list rather than an allow list. That is the opposite of the
 * usual advice and it is deliberate: confining Python to an allowlist means
 * enumerating every path CPython, numpy and pandas touch, which is a list we
 * would get wrong on their next release. Naming what must stay unreachable is
 * shorter and does not rot.
 *
 * .pgdata is here because the database files are the database. User password
 * hashes and stored credential ciphertext both live there, and reading them
 * needs neither a connection nor a password.
 */
function deniedPaths(): string[] {
  const root = process.cwd();
  const home = os.homedir();
  return [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, 'data-service', '.env'),
    path.join(root, '.pgdata'),
    path.join(root, '.git'),
    path.join(home, '.ssh'),
    path.join(home, '.aws'),
    path.join(home, '.gnupg'),
    path.join(home, '.config'),
    path.join(home, 'Library', 'Keychains'),
  ];
}

/** Directory holding the sitecustomize that installs the in-process guard. */
const GUARD_DIR = path.join(process.cwd(), 'data', 'python', 'sandbox');

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
 * this can be as short as it is: everything here is for the interpreter or
 * for the guard, not for our code.
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
    // `site` imports sitecustomize from here during interpreter startup, so
    // the guard is installed before any executor or strategy code runs.
    PYTHONPATH: GUARD_DIR,
    SV_SANDBOX_DENY: JSON.stringify(deniedPaths()),
    SV_SANDBOX_DENY_NETWORK: '1',
  };
}

/* ── Kernel confinement ──────────────────────────────────────────────────
 *
 * The in-process guard is the portable floor and runs everywhere, but it
 * lives inside the process it constrains and ctypes can reach around it —
 * documented at its definition. The boundary is the kernel, and each OS
 * spells it differently, so the platform-specific part is isolated here
 * behind one shape: given a command, return the command that runs it
 * confined.
 *
 * Nothing here is trusted on the strength of being implemented. Each backend
 * is probed once at startup and used only if the probe shows a denial
 * actually bites; otherwise the process runs on the portable layer alone and
 * says so. That is what makes it safe to ship a backend that cannot be tested
 * on the machine it was written on — the target host verifies it itself
 * rather than taking our word for it.
 */

type Wrapper = (executable: string, args: string[]) => [string, string[]];

interface Confinement {
  readonly kind: string;
  readonly wrap: Wrapper;
}

/** Escape a path for use inside a macOS sandbox profile regex literal. */
function sbRegex(p: string): string {
  return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * macOS: sandbox-exec, which needs no root, no separate user and no
 * container, so it fits a deployment that has deliberately avoided all three.
 *
 * The profile is allow-by-default with targeted denials for the reason given
 * on `deniedPaths`, and because a deny-all profile aborts CPython before it
 * reaches main — tried, SIGABRT.
 */
function darwinConfinement(): Confinement | null {
  const denied = deniedPaths();
  const profile = [
    '(version 1)',
    '(allow default)',
    '(deny file-read*',
    // .env matches as a prefix so .env.production and friends are covered
    // without having to predict their names.
    `  (regex #"^${sbRegex(path.join(process.cwd(), '.env'))}")`,
    `  (regex #"^${sbRegex(path.join(process.cwd(), 'data-service', '.env'))}")`,
    ...denied.map((p) => `  (subpath "${p}")`),
    '  )',
    '(deny network*)',
    '',
  ].join('\n');

  const file = path.join(os.tmpdir(), 'stockviewer-python.sb');
  fs.writeFileSync(file, profile, { mode: 0o600 });

  return {
    kind: 'sandbox-exec',
    wrap: (executable, args) => ['sandbox-exec', ['-f', file, executable, ...args]],
  };
}

/**
 * Linux: bubblewrap, the same mechanism Flatpak uses, which runs unprivileged
 * on any kernel with user namespaces enabled.
 *
 * Denial is by mount rather than by rule: a file is covered with /dev/null and
 * a directory with an empty tmpfs, so the path still resolves but holds
 * nothing. --unshare-net gives the child a network namespace with no route
 * out, which denies the network without needing a firewall rule.
 */
function linuxConfinement(): Confinement | null {
  if (!spawnSync('bwrap', ['--version'], { encoding: 'utf8' }).stdout) return null;

  const covers: string[] = [];
  for (const p of deniedPaths()) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      continue; // absent paths need no cover, and naming them fails the mount
    }
    if (stat.isDirectory()) covers.push('--tmpfs', p);
    else covers.push('--bind', '/dev/null', p);
  }

  return {
    kind: 'bwrap',
    wrap: (executable, args) => [
      'bwrap',
      ['--dev-bind', '/', '/', '--unshare-net', ...covers, executable, ...args],
    ],
  };
}

/**
 * The active backend, or null when the host offers none.
 *
 * The probe deliberately checks that a denial *bites* rather than only that
 * the wrapper runs. A profile that silently stopped applying would otherwise
 * read as success, which is the failure mode worth guarding against: it looks
 * identical to working right up until it matters.
 */
const confinement: Confinement | null = (() => {
  let candidate: Confinement | null = null;
  try {
    if (process.platform === 'darwin') candidate = darwinConfinement();
    else if (process.platform === 'linux') candidate = linuxConfinement();
  } catch (e) {
    console.warn('[python-child] could not set up kernel confinement:', e);
    return null;
  }

  if (!candidate) {
    console.warn(
      '[python-child] no kernel confinement on %s; user Python runs under the ' +
        'in-process guard alone, which ctypes can bypass.',
      process.platform
    );
    return null;
  }

  const target = path.join(process.cwd(), '.env');
  const script =
    `try{require('fs').readFileSync(${JSON.stringify(target)});console.log('READABLE')}` +
    `catch(e){console.log(e.code==='EPERM'||e.code==='EACCES'?'DENIED':'ABSENT')}`;
  const [cmd, argv] = candidate.wrap(process.execPath, ['-e', script]);
  const probe = spawnSync(cmd, argv, { encoding: 'utf8', timeout: 15_000 });
  const verdict = (probe.stdout || '').trim();

  if (probe.status === 0 && (verdict === 'DENIED' || verdict === 'ABSENT')) {
    return candidate;
  }

  console.warn(
    '[python-child] %s did not confine as expected (%s); user Python will run ' +
      'under the in-process guard alone.',
    candidate.kind,
    verdict || probe.stderr?.trim() || `exit ${probe.status}`
  );
  return null;
})();

/** Which kernel backend is confining user Python, if any. */
export function pythonConfinement(): string | null {
  return confinement?.kind ?? null;
}

/* ── Concurrency ─────────────────────────────────────────────────────────
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
 * The cap is deliberately smaller than the core count. These processes are
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

/** Spawn a Python child under the shared environment and confinement policy. */
export function spawnPython(
  executable: string,
  args: string[]
): ChildProcessWithoutNullStreams {
  const [cmd, argv] = confinement
    ? confinement.wrap(executable, args)
    : [executable, args];

  return spawn(cmd, argv, {
    stdio: ['pipe', 'pipe', 'pipe'] as const,
    env: pythonChildEnv(),
  });
}

/** Current occupancy and confinement, for health endpoints. */
export function pythonSlotStats() {
  return {
    active,
    waiting: waiting.length,
    limit: MAX_CONCURRENT,
    confinement: pythonConfinement(),
  };
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
