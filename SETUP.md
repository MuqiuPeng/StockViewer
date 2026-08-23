# StockViewer Setup Guide

Everything runs as a native process on one machine: the Next.js app, a Python
data service, and a PostgreSQL cluster kept inside the repository directory.
There is no container runtime and no hosted dependency.

## Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 16 (`brew install postgresql@16`, or your platform's package)

## 1. Dependencies

```bash
git clone <repository-url>
cd StockViewer
npm install
```

## 2. Python environment

One virtualenv serves both the data service and the executors that run user
indicators and backtests.

```bash
python3 -m venv python-venv
./python-venv/bin/pip install -r data-service/requirements.txt
./python-venv/bin/pip install -r data/python/requirements.txt
```

## 3. Database

The cluster lives in `.pgdata/` inside the repository. It is gitignored and
disposable — deleting it loses the data, not the installation.

```bash
initdb -D .pgdata --encoding=UTF8 --locale=C
pg_ctl -D .pgdata -l .pgdata/server.log start
createdb stockviewer
```

`--locale=C` is not decoration: initdb fails with a "multithreaded during
startup" error on macOS when the locale is unset.

## 4. Configuration

```bash
cp .env.local.example .env.local
```

Then open it and generate each secret — the command for each is in the file.
Nothing has a working default, deliberately: a shipped default secret is not a
default, it is a published one.

Three of them are shared between the two services and both must agree:
`DATA_SERVICE_TOKEN`, `LOG_INGEST_SECRET`, `CRON_SECRET`. The data service
refuses to serve at all without the first.

Back up `CREDENTIAL_ENCRYPTION_KEY` somewhere other than this machine. It
encrypts the provider API keys stored in the database, and losing it means
fetching each key from its provider's dashboard and entering it again.

## 5. Schema and first account

```bash
npx prisma migrate deploy
npx tsx scripts/create-admin.ts <email> <password>
```

Registration is open, but a new account cannot sign in until an administrator
approves it, so the first account has to be made here.

## 6. Run

Two processes, two terminals.

```bash
cd data-service && ../python-venv/bin/python -m app
```

```bash
npm run dev
```

Open http://localhost:3000.

The web app listens on all interfaces so others on the network can reach it.
The data service listens on loopback only and is called by the web server with
`DATA_SERVICE_TOKEN`; the browser never talks to it directly. Change
`BIND_HOST` only if you mean to, and read what it says in the example file
first.

## Provider API keys

Keys are not configured in a file. Sign in as an administrator and add them
under the admin page, where each is stored encrypted alongside its quota,
validity window and priority. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)
for which providers cover which markets.

The application works without any of them — the free sources need no key — but
each key added is another path that can serve a request when one provider is
rate-limited or down.

## Troubleshooting

**`initdb` fails with a multithreading error.** Locale is unset. Use
`--locale=C` as above, or export `LC_ALL=C` first.

**The data service exits complaining about `DATA_SERVICE_TOKEN`.** That is
deliberate — it refuses to run unprotected rather than run unprotected
silently. Generate the token into `.env.local` and restart both services.

**Requests to the data service return 401.** The web app and the data service
are reading different values. Both read `.env` and `.env.local` from the
repository root; check the token is in one file and not in both with different
values, and restart both after any change — neither re-reads it while running.

**`Port already in use`.**

```bash
lsof -ti:3000 | xargs kill -9
```

**Python import errors inside indicators.** Confirm the virtualenv has the
executor requirements:

```bash
./python-venv/bin/pip install -r data/python/requirements.txt
```

**User Python cannot read a file it expects to.** It is confined on purpose.
See the Security section of the [README](README.md) for what is blocked and
which layer is doing the blocking.

## Next steps

- [README](README.md) — usage and architecture
- [docs/INDICATORS.md](docs/INDICATORS.md) — writing indicators
- [docs/BACKTESTING.md](docs/BACKTESTING.md) — strategies and backtests
- [CONTRIBUTING.md](CONTRIBUTING.md) — branches and migrations
