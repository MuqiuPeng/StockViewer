# Architecture

How StockViewer is put together, and why in the places where the reason is not
obvious.

- [Shape](#shape)
- [Repository layout](#repository-layout)
- [The boundaries](#the-boundaries)
- [Running user Python](#running-user-python)
- [Data flow](#data-flow)
- [Storage](#storage)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Development](#development)

## Shape

Three processes on one machine.

```
web (Next.js)      :3000    all interfaces — this is what the LAN reaches
data-service       :8000    loopback only — called by web with a shared token
postgres           :5432    cluster in .pgdata/, project-local
```

The web app serves the UI and the API, holds the sessions, and owns the
database. The data service fetches market data from external providers and
holds the credentials for them. Postgres holds everything an installation
accumulates.

User-authored Python — indicators, strategies, backtests — runs as a child
process of the web app, confined by the host kernel. That is the single
constraint that shapes the deployment: it needs a real process and a real
kernel, so there is no container image and no serverless target.

## Repository layout

One repository, four sub-projects. `apps/` is what gets deployed, `packages/`
is what they depend on.

```
apps/
  web/                  Next.js — pages, API routes, components
  data-service/         FastAPI — provider fetching, routing, credentials
packages/
  db/                   @stockviewer/db — schema, migrations, data access
  shared/               @stockviewer/shared — types crossing client/server
  executors/            Python that runs user code, spawned per request
  ccm/                  convergent cross mapping, a standalone library
scripts/                one-off operational scripts, run from the root
python-venv/            one virtualenv, shared by all the Python above
```

Each package has a README saying what belongs in it. The two Python
directories under `packages/` are different kinds of thing on purpose: `ccm` is
an installed library, `executors` is a bundle of scripts that are spawned by
path — `packages/executors/README.md` explains why it is not packaged.

## The boundaries

Enforced by package dependency rather than by convention:

| From | May import |
|---|---|
| `apps/web/components` | `@stockviewer/shared` |
| `apps/web/app/api` | `@stockviewer/shared`, `@stockviewer/db` |
| `scripts/` | both, and `@prisma/client` |
| `packages/db` | `@stockviewer/shared` |
| `packages/shared` | nothing — types only, no runtime |

A component importing `@stockviewer/db` is a mistake visible in the import
line. That is the whole reason these are packages and not folders: before,
`components/BacktestPage.tsx` imported a stored record's type from the module
that also wrote it to Postgres, and nothing said it could not.

`app/api` stays inside `apps/web` rather than becoming its own service,
because the App Router requires pages and routes in one project. The front/back
line is the package boundary above, not a directory.

### What is left in `apps/web/lib`

Not everything that queries the database belongs in `@stockviewer/db`. The seam
is data access, not "touches Prisma":

- `admin.ts` — an authorization policy that happens to read one row
- `logger.ts` — application logging, writing to `SystemLog`
- `indicator-compute.ts` — orchestration: fetches bars, spawns Python, caches
- `data-service-client.ts` — the typed client for the data service
- `python-child.ts`, `python-executor.ts`, `backtest-executor.ts` — the bridge
- `paths.ts` — where the repository root is

All of them import the client from the package like any other caller.

## Running user Python

Executing user-supplied code is the product — people write strategies and the
point is to run them — so the question is not whether to execute it but what it
can reach while it does. Four layers, each one assuming the one above it can
be defeated.

**The namespace.** `indicator_executor.py` builds the globals explicitly —
`pd`, `np`, `data`, `parameters`, `MyTT`, and every public MyTT function — and
`exec()`s the user's code against it. This shapes what is convenient, nothing
more; it is not a security boundary.

**The environment.** A child inherits `process.env` unless told otherwise, and
in the Next.js server that holds `CREDENTIAL_ENCRYPTION_KEY`, `AUTH_SECRET`
and `DATABASE_URL`. The child gets a short allowlist instead, with `HOME`
redirected to a scratch directory — the real one is the path to `~/.ssh` and
`~/.aws`.

**The in-process guard.** `packages/executors/src/sandbox/sitecustomize.py`
installs CPython audit hooks that refuse the paths named in `SV_SANDBOX_DENY`
and refuse sockets when `SV_SANDBOX_DENY_NETWORK` is set. It is imported by
`site` during interpreter startup — which is why the web app passes its
*directory* on `PYTHONPATH` — so it is in place before any executor or user
code runs. It lives inside the process it constrains, so `ctypes` can reach
around it. It is the portable floor, not the boundary.

**The kernel.** `sandbox-exec` on macOS, `bubblewrap` on Linux. Neither needs
root, a separate user, or a container, which is what makes them usable in a
deployment that has avoided all three. The backend is probed once at startup
and used only if the probe shows a denial actually *bites* — a profile that
silently stopped applying would otherwise read as success, which looks
identical to working right up until it matters.

The paths that must stay unreachable are listed once, in
`apps/web/lib/python-child.ts`, and all three enforcing layers are built from
that one list. It is a deny list rather than an allow list on purpose:
confining Python to an allowlist means enumerating every path CPython, numpy
and pandas touch, which is a list that would be wrong on their next release.

### Data exchange

JSON on stdin, JSON on stdout.

```json
{ "code": "def calculate(data):\n    return MA(data['close'], 20)",
  "data": [ { "date": "2026-01-02", "open": 10.5, "close": 10.75 } ],
  "parameters": { "window": 20 } }
```

```json
{ "success": true, "values": [null, null, 10.6] }
```

On failure: `success: false` with `error`, `type` and a trimmed `traceback`.

### Concurrency

Each child imports pandas and numpy — on the order of 100MB resident before it
reads a bar — and the timeout is five minutes, so slow backtests overlap rather
than queue. A semaphore in `python-child.ts` caps concurrent children at half
the core count, and a request that waits more than 60 seconds for a slot fails
with a 503 rather than holding a connection for an unbounded backlog.

## Data flow

**Importing a stock.** The browser asks the web app, which asks the data
service, which picks a provider for that market and fetches bars. Rows land in
`Stock` and `StockPrice`. Nothing is written to disk.

**Applying an indicator.** `indicator-compute.ts` loads the bars, resolves the
indicator's dependencies into an order, and spawns one child per indicator.
Results go to `IndicatorValue`, keyed by the `StockPrice` row and carrying a
version derived from the indicator's code — so editing the code invalidates
what was computed from it rather than serving a stale column.

**Running a backtest.** The route loads the strategy and the bars, spawns
`backtest_executor.py`, and gets metrics, an equity curve and trade markers
back. The whole result is stored in the history entry, so a backtest can be
reviewed without recomputing it.

**Viewing charts.** The viewer reads bars and indicator values through the API
and renders three synchronised panes with TradingView Lightweight Charts.

## Storage

Postgres, through Prisma. There is no file-based mode, no CSV directory and no
JSON file; a repository that still mentions one is out of date.

| What | Where |
|---|---|
| Stock metadata, OHLC bars | `Stock`, `StockPrice` — shared across users |
| Computed indicator values | `IndicatorValue`, versioned for invalidation |
| Indicators, strategies, groups, view settings | per-user, through the storage layer |
| Backtest history | per-user, with the full result retained |
| Users, teams, invitations, tickets, posts, notifications | their own tables |
| System logs | `SystemLog`, written by `logger.ts` and the data service |
| Provider API keys | encrypted at rest with AES-256-GCM |

Two kinds of access, in `@stockviewer/db`:

`getAuthenticatedStorage(userId)` returns stores scoped to one user, and the
five user-owned collections go through it. Every CRUD function takes that
provider, so the caller's identity decides what it can see rather than each
query remembering to filter.

`prisma` is exported directly for everything else — most of the schema has no
per-user store and its routes query it directly.

## Configuration

`.env` and `.env.local` at the repository root, read by all three of the web
app, the data service and the scripts. One copy, because `DATABASE_URL` and
`CREDENTIAL_ENCRYPTION_KEY` are shared and three copies would be three things
to rotate.

Next only reads `.env` from its own project root, which is `apps/web`, so
`apps/web/next.config.js` loads the root files explicitly before exporting the
config. This has to happen there rather than anywhere inside the app, because
`NEXT_PUBLIC_STORAGE_MODE` is inlined into the client bundle at build time.

The data service resolves the same two files from `apps/data-service/app/
config.py`, plus an optional service-local `.env` for overrides, and refuses to
start if the root it computed does not look like the repository.

See [.env.local.example](../.env.local.example) for the full list, each secret
with the command that generates it. Neither service re-reads these while
running — restart after a change.

**Exposure.** Widening `BIND_HOST` past loopback puts every stored provider
credential behind one shared token, so the data service refuses to bind
elsewhere unless `DATA_SERVICE_TOKEN` is set. The web app is the only thing
meant to be reachable.

## Deployment

```bash
npm run build
npm start
```

Three native processes, as above. **Before publishing the repository**, run
`./scripts/check-repo-clean.sh`. It checks the tracked file set rather than the
working tree, because ignore rules do not apply to files already tracked — a
secret committed once stays committed however good the rules become afterwards.

## Development

```bash
npm install                      # workspace root, links all packages
npm run dev                      # web, via the workspace
npm run typecheck                # scripts and packages, then the app
npm run db:migrate               # create and apply a migration
npm run db:status                # what is applied and what is pending
```

```bash
cd apps/data-service && ../../python-venv/bin/python -m app
cd apps/data-service && ../../python-venv/bin/python -m pytest -q
cd packages/ccm      && ../../python-venv/bin/python -m pytest -q
```

Setup from scratch is [SETUP.md](../SETUP.md); the migration workflow and
commit conventions are [CONTRIBUTING.md](../CONTRIBUTING.md).

## Next

- [Indicators](INDICATORS.md) — the indicator system
- [Backtesting](BACKTESTING.md) — the backtesting engine
- [API Reference](API.md) — endpoints
- [Data Sources](DATA_SOURCES.md) — providers and routing
- [Datasets & Groups](DATASETS.md) — data management
