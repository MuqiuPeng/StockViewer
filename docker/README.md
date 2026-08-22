# data-service container image

The only container this project still ships. It packages the Python
FastAPI market-data service (`../data-service`) so it can be deployed to
a platform that builds from a Dockerfile — Railway, Fly.io, Render.

Everything else that used to live here (a Next.js image, a combined
supervisord image, nginx, and the local/production/NAS compose stacks)
was removed: the app is hosted on Vercel, and local development runs the
web app and the data-service as native processes, with Postgres provided
by the hosted database.

## Build and run locally

```bash
docker build -f docker/Dockerfile.data-service -t stockviewer-data-service .
docker run --rm -p 8000:8000 stockviewer-data-service
```

Health check: `curl http://localhost:8000/api/v1/health`

Note that running the data-service in Docker on macOS is what forced the
HTTPS_PROXY workaround documented in
`data-service/app/providers/eastmoney_provider.py` — EastMoney is only
reachable over IPv6 from the host there. Running it natively (see the
repository README) avoids that entirely, so prefer native for local work
and keep this image for deployment.

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `LOG_INGEST_SECRET` | No | Shared secret for forwarding logs to the app's `/api/admin/logs/ingest/service` |
| `HTTPS_PROXY` | No | Only needed when the container cannot reach EastMoney directly |

## Database migrations

Prisma migrations are owned by the web app, not by this image. Apply them
against the hosted database with:

```bash
npx prisma migrate deploy
```

For a database that pre-dates the `prisma/migrations` directory, mark the
baseline as already applied once, or `migrate deploy` will try to recreate
existing tables:

```bash
npx prisma migrate resolve --applied 20260502000000_init
npx prisma migrate resolve --applied 20260502000001_rename_datasource_ids
```

## Scheduled dataset updates

Previously a cron job inside the app container. Now handled by Vercel Cron,
declared in `vercel.json` (`/api/cron/update-datasets`, daily at 10:00 UTC).
