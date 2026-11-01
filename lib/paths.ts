/**
 * Where the repository root is, and what lives under it.
 *
 * Every path here used to be built from `process.cwd()`. That was correct
 * while the whole application was a single package at the repository root, and
 * it became wrong the moment the tree became a workspace: `npm run dev -w
 * apps/web` sets cwd to `apps/web`, and a path joined onto that lands
 * somewhere that does not exist.
 *
 * For most callers that is an ordinary bug — a script is not found and the
 * request fails loudly. For two of them it is a security problem, because they
 * build the sandbox that confines user-authored Python:
 *
 *   - `deniedPaths()` lists what that Python must not read: .env, the Postgres
 *     cluster, ~/.ssh. Rooted wrongly, it denies reads of files nobody was
 *     going to read while the real .env stays readable.
 *   - the macOS sandbox profile is generated from the same list, so it inherits
 *     the same hole.
 *   - the confinement probe checks that a denial *bites* by reading a denied
 *     file — but it accepts "absent" as a pass, since a fresh clone genuinely
 *     may have no .env. A wrong root makes every target absent, so the probe
 *     reports a working sandbox precisely when there is none.
 *
 * That last one is why resolution here refuses to guess. It looks for the
 * workspace root's markers and throws when it cannot find them. A startup
 * failure is recoverable in a way that a silently unconfined interpreter is
 * not.
 */

import fs from 'fs';
import path from 'path';

/**
 * Files and directories that exist only at the workspace root.
 *
 * All of them, not any of them. `package.json` alone is useless here — every
 * workspace package has one — and it is the nearest wrong answer, which is
 * the one worth excluding.
 */
const ROOT_MARKERS = ['package-lock.json', 'packages'] as const;

function looksLikeRoot(dir: string): boolean {
  return ROOT_MARKERS.every((marker) => fs.existsSync(path.join(dir, marker)));
}

function walkUpFrom(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (looksLikeRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

let cachedRoot: string | null = null;

/**
 * The workspace root.
 *
 * Tries cwd first, then this module's own location. The second is what covers
 * a Next.js server bundle, where cwd is whatever started the process but the
 * bundle itself still sits under `.next/` inside the tree.
 *
 * `SV_REPO_ROOT` overrides both and is still verified, so a typo in it fails
 * here rather than three layers down.
 */
export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;

  const override = process.env.SV_REPO_ROOT;
  if (override) {
    const resolved = path.resolve(override);
    if (!looksLikeRoot(resolved)) {
      throw new Error(
        `SV_REPO_ROOT=${override} does not look like the workspace root: ` +
          `expected it to contain ${ROOT_MARKERS.join(' and ')}.`
      );
    }
    cachedRoot = resolved;
    return cachedRoot;
  }

  for (const start of [process.cwd(), __dirname]) {
    const found = walkUpFrom(start);
    if (found) {
      cachedRoot = found;
      return cachedRoot;
    }
  }

  throw new Error(
    'Could not locate the workspace root. Looked upward from ' +
      `${process.cwd()} and ${__dirname} for a directory containing ` +
      `${ROOT_MARKERS.join(' and ')}. Set SV_REPO_ROOT to the repository ` +
      'root. This is fatal rather than a fallback because the Python sandbox ' +
      'builds its denied-path list from this location, and a wrong root ' +
      'produces a sandbox that confines nothing while still probing as ' +
      'working.'
  );
}

/**
 * The directory holding the Python executors.
 *
 * They are spawned by file path rather than imported, so this is a real
 * directory and not a module name. `SV_EXECUTORS_DIR` exists for a deployment
 * that keeps them somewhere else; it is not verified beyond being a path,
 * because a missing script fails clearly at spawn time.
 */
export function executorsDir(): string {
  return (
    process.env.SV_EXECUTORS_DIR ||
    path.join(repoRoot(), 'packages', 'executors', 'src')
  );
}

/** Absolute path to one executor script, e.g. `executor.py`. */
export function executorScript(filename: string): string {
  return path.join(executorsDir(), filename);
}

/**
 * The directory holding the sitecustomize that installs the in-process guard.
 *
 * Passed to the child as PYTHONPATH, which is why it must be the directory
 * and not the file: `site` imports `sitecustomize` by name during interpreter
 * startup, before any executor or user code runs.
 */
export function sandboxDir(): string {
  return path.join(executorsDir(), 'sandbox');
}
