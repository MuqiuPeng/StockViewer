# @stockviewer/db

The Postgres schema, its migrations, and the code that reads and writes it.

```
prisma/
  schema.prisma          the schema
  migrations/            applied in order; never edited after the fact
prisma.config.ts         resolves every path from this file, not from cwd
src/
  client.ts              the PrismaClient singleton
  storage/               the user-scoped storage abstraction
  *-storage.ts           per-collection CRUD
```

## The boundary

Importable from an API route or a script. **Not from a React component** —
everything here opens a connection. A component needs the record's shape, not
the query, and those types are in `@stockviewer/shared`.

So: `components/*` importing `@stockviewer/db` is a mistake visible in the
import line, which is the whole reason this is a package rather than a folder.

## Two kinds of access

`getAuthenticatedStorage(userId)` returns stores scoped to one user, and the
five user-owned collections — indicators, strategies, backtest history, groups,
view settings — go through it. Every CRUD function takes that provider, so the
caller's identity decides what it can see rather than each query remembering to
filter.

`prisma` is exported directly for everything else, which is most of the schema:
users, teams, tickets, posts, notifications, logs, provider credentials. Those
have no per-user store and their routes query them directly.

`stock-storage.ts` takes no provider at all. Stock and StockPrice are shared
across users, not owned by one.

## Migrations

```bash
npm run db:generate          # regenerate the client after a schema edit
npm run db:migrate           # create and apply a migration in development
npm run db:migrate:deploy    # apply pending migrations (production)
npm run db:status            # what is applied and what is pending
```

All four run from the repository root and pass `--config` so Prisma finds this
package's config wherever it is invoked from. `DATABASE_URL` is read from the
root `.env.local`, which the web app owns and the data service also reads.

The generated client has no custom `output`, so it lands in
`node_modules/@prisma/client` at the workspace root and every package resolves
the same copy. Generated types and enums are imported from `@prisma/client`
directly rather than re-exported here: they are an external vocabulary, and a
re-export would add an indirection without adding a boundary.

## Caching note

`IndicatorValue` rows carry a version so a changed indicator invalidates what
was computed from it — see `lib/code-hash.ts` in the web app. Anything else
that persists a computed value needs the same treatment, including
`ccm.__version__` if the analysis library is ever wired into a stored column.
