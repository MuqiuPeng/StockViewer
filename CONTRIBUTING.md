# Contributing

## Branch Layout

| Branch | Purpose |
|---|---|
| `main` | Active development: multi-user, Postgres, local accounts, run on one host and reached over the LAN. All feature/fix branches target `main`. |
| `local` | Frozen single-user CSV-based build. Tagged `v0.1.0-local`. Bug-fix-only — keep changes minimal. |
| `feature/<short-slug>` | New features. Open a PR against `main`. |
| `fix/<short-slug>` | Bug fixes. Open a PR against `main`. |
| `hotfix/<short-slug>` | Urgent production fixes against the latest release tag. PR back to `main`. |

Delete the topic branch after the PR is merged.

## Releases

We follow [Semantic Versioning](https://semver.org/). Releases are recorded in
`CHANGELOG.md` and marked with annotated git tags:

- `v<MAJOR>.<MINOR>.<PATCH>` — online-server releases
- `v<MAJOR>.<MINOR>.<PATCH>-local` — local-build releases

To cut a release:

1. Update `package.json` `version`.
2. Move `[Unreleased]` notes in `CHANGELOG.md` under a new dated heading.
3. Commit (`chore(release): vX.Y.Z`), tag (`git tag -a vX.Y.Z -m "..."`), push
   the branch and the tag.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) so the
history can be parsed for changelogs and release notes.

```
<type>(<scope>): <subject>
```

| Type | Use for |
|---|---|
| `feat` | A user-visible feature |
| `fix` | A bug fix |
| `refactor` | Code change with no behavioural difference |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `chore` | Tooling, deps, config, release commits |
| `test` | Adding or fixing tests |
| `build` | Build system / CI |
| `revert` | Reverts a previous commit |

Scope is optional but encouraged: `feat(backtest): ...`, `fix(prisma): ...`,
`refactor(editor): ...`.

Subject line: imperative mood, no trailing period, ≤72 characters. Squash
fix-up commits before opening the PR.

## Database Migrations

Schema is managed by Prisma migrations under `prisma/migrations/`.

- Edit `prisma/schema.prisma`.
- Run `npx prisma migrate dev --name <short_description>` against a local
  Postgres to generate a migration directory.
- Commit the generated `migration.sql` along with the schema change.
- Never run `prisma db push` against a database holding real data — reconcile
  it by running `npx prisma migrate deploy`.

For a database that pre-dates the `prisma/migrations/` directory, run once
before the first `migrate deploy`:

```
prisma migrate resolve --applied 20260502000000_init
prisma migrate resolve --applied 20260502000001_rename_datasource_ids
```

This marks the baseline as already applied so `migrate deploy` only runs
future migrations.
