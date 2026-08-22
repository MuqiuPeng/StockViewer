# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Reorganised Git branches: `main` is now the active development line for the
  online-server build; the previous local-only build is preserved on the
  `local` branch.
- Replaced `prisma db push` with `prisma migrate deploy` in the Docker
  entrypoint and seeded the migrations directory with a proper `init` baseline
  plus the `rename_datasource_ids` data migration.
- Bumped package version from `0.1.0` to `1.0.0` to match the README badge and
  reflect the production-ready online-server release.

### Added
- `CHANGELOG.md` and `CONTRIBUTING.md` documenting release notes and commit
  conventions.

## [1.0.0] - 2026-05-02 — online-server

First production-ready, multi-user release. Marked by tag `v1.0.0-online`
(commit `cb57be6`).

### Added
- PostgreSQL storage layer with Prisma ORM (replaces CSV files).
- NextAuth-based authentication with GitHub/Google OAuth, user registration
  approval, and admin role management.
- Independent FastAPI `data-service` with pluggable providers (AKShare,
  EastMoney) and canonical `market.category` data-source IDs.
- Team collaboration: groups, invitations, group chat, shared
  indicators/strategies/datasets, and a posts/share feed.
- Ticket system for full-refresh, custom-data, and dataset-deletion requests.
- Notifications, profile pages, and dependency graph visualisation.
- Admin console for users, datasets, and tickets.
- Docker deployment: combined image, production compose file, scheduled cron
  for daily dataset updates, Cloudflare Tunnel profile, GCP Cloud Build config.
- Indicator editor refactor: import panel, ID-based placeholders, period
  selector (D/W/M/Q), cross-period dependency support, frontend cache.
- Backtest history overhaul with batch operations and shared component
  modules.
- CSV upload, image lightbox in posts, mobile blocker.

### Changed
- Storage abstraction (`lib/storage/`) decouples application from CSV/DB
  implementation.
- Strategy and indicator editors share a unified three-column layout.
- Indicator name uniqueness scoped per-user instead of global.

### Removed
- Legacy `aktools` Docker service (replaced by `data-service`).
- CSV-based storage helpers (`lib/csv*`, `lib/datasets.ts`,
  `lib/dataset-metadata.ts`, `lib/date-cleaner.ts`) and their tests.
- `app/api/apply-indicator-stream`, `backtest-history/[id]/rerun`,
  `check-orphaned-columns`, `dataset/[name]`, `datasets/name` routes
  superseded by ID-based equivalents.

## [0.1.0] - 2025 — local

Single-user local build with CSV-based storage. Marked by tag `v0.1.0-local`
(commit `daeb481`). Preserved on the `local` branch for offline use.

### Features
- Triple synchronised TradingView chart layout, custom Python indicators using
  MyTT, single-stock and portfolio backtesting, dark mode, view-settings
  persistence, multi-market data sources via AKTools, Docker setup.
