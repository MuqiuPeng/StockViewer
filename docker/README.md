# StockViewer Docker Deployment

Complete Docker deployment for StockViewer with PostgreSQL database support.

## Prerequisites

- [Docker Desktop](https://www.docker.com/get-started) installed and running

## Quick Start

### 1. Configure Environment

```bash
# From project root
cp .env.docker.example .env.docker
```

Edit `.env.docker` and fill in:
- `AUTH_SECRET`: Generate with `openssl rand -base64 32`
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`: For GitHub OAuth (optional)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: For Google OAuth (optional)

### 2. Start Services

```bash
# Start PostgreSQL + App
docker compose --env-file .env.docker up -d --build

# With Cloudflare Tunnel (for external access)
docker compose --env-file .env.docker --profile tunnel up -d --build
```

### 3. Access

- **Local**: http://localhost:3000
- **External**: Your configured domain (e.g., https://stockviewer.robindev.org)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Network                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            StockViewer App Container                  │   │
│  │  ┌─────────────────┐     ┌─────────────────┐         │   │
│  │  │   Next.js       │     │    AKTools      │         │   │
│  │  │   Port: 3000    │────▶│    Port: 8080   │         │   │
│  │  └────────┬────────┘     └─────────────────┘         │   │
│  │           │               (internal only)             │   │
│  └───────────┼──────────────────────────────────────────┘   │
│              │                                               │
│  ┌───────────▼──────────┐     ┌─────────────────────────┐   │
│  │    PostgreSQL        │     │  Cloudflare Tunnel      │   │
│  │    Port: 5432        │     │  (optional)             │   │
│  └──────────────────────┘     └─────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Docker Volumes                      │   │
│  │  - postgres-data (database)                           │   │
│  │  - app-data (CSV files, user data)                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Commands

All commands from project root:

### View Logs

```bash
docker compose logs -f          # All services
docker compose logs -f app      # App only
docker compose logs -f db       # Database only
docker compose logs -f tunnel   # Tunnel only (if enabled)
```

### Stop Services

```bash
docker compose down             # Stop containers
docker compose down -v          # Stop and remove volumes (data loss!)
```

### Rebuild

```bash
docker compose --env-file .env.docker up --build -d
```

### Status

```bash
docker compose ps
```

### Database Access

```bash
# Connect to PostgreSQL
docker compose exec db psql -U stockviewer -d stockviewer

# Run migrations manually
docker compose exec app prisma migrate deploy --schema=/app/prisma/schema.prisma
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | Session encryption key |
| `AUTH_URL` | No | External URL (default: http://localhost:3000) |
| `AUTH_GITHUB_ID` | No | GitHub OAuth client ID |
| `AUTH_GITHUB_SECRET` | No | GitHub OAuth client secret |
| `AUTH_GOOGLE_ID` | No | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | No | Google OAuth client secret |
| `CLOUDFLARE_TUNNEL_TOKEN` | No | Token for Cloudflare Tunnel |
| `POSTGRES_USER` | No | Database user (default: stockviewer) |
| `POSTGRES_PASSWORD` | No | Database password (default: stockviewer123) |
| `POSTGRES_DB` | No | Database name (default: stockviewer) |

### OAuth Setup

#### GitHub

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create "New OAuth App"
3. Set callback URL: `{AUTH_URL}/api/auth/callback/github`
4. Copy Client ID and Secret to `.env.docker`

#### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create "OAuth 2.0 Client ID" (Web application)
3. Add authorized redirect: `{AUTH_URL}/api/auth/callback/google`
4. Copy Client ID and Secret to `.env.docker`

### Cloudflare Tunnel

1. Login to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Create a Tunnel → Get the token
3. Configure ingress to point to `http://app:3000`
4. Set `CLOUDFLARE_TUNNEL_TOKEN` in `.env.docker`
5. Start with `--profile tunnel`

## Data Persistence

| Volume | Purpose |
|--------|---------|
| `postgres-data` | PostgreSQL database |
| `app-data` | CSV files, user uploads |

### Backup

```bash
# Backup PostgreSQL
docker compose exec db pg_dump -U stockviewer stockviewer > backup.sql

# Backup app data
docker run --rm -v stockviewer_app-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/app-data.tar.gz -C /data .
```

### Restore

```bash
# Restore PostgreSQL
cat backup.sql | docker compose exec -T db psql -U stockviewer stockviewer

# Restore app data
docker run --rm -v stockviewer_app-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/app-data.tar.gz -C /data
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs app

# Check if database is ready
docker compose logs db
```

### Database Connection Error

```bash
# Ensure db is healthy
docker compose ps

# Test connection
docker compose exec app prisma db push --skip-generate
```

### Port Conflict

Edit `docker-compose.yml` to change ports:

```yaml
services:
  app:
    ports:
      - "3001:3000"  # Change external port
  db:
    ports:
      - "5433:5432"  # Change external port
```

### Clean Rebuild

```bash
docker compose down -v
docker system prune -f
docker compose --env-file .env.docker up --build -d
```

## Development

For development with hot-reload, use the standard setup:

```bash
npm install
npm run dev
```

See main [README.md](../README.md) for development setup.
