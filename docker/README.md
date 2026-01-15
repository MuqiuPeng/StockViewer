# StockViewer Docker Deployment

One-click Docker deployment for StockViewer.

## Prerequisites

- [Docker Desktop](https://www.docker.com/get-started) installed and running

## Quick Start

### macOS / Linux

```bash
cd docker
chmod +x start.sh
./start.sh
```

### Windows

```cmd
cd docker
start.bat
```

Or double-click `start.bat` in File Explorer.

## Access

After startup (may take 1-2 minutes for AKTools to initialize):

- **App**: http://localhost:3000
- **AKTools API**: http://localhost:8080

## Commands

All commands should be run from the `docker` directory.

### View Logs

```bash
docker compose logs -f
```

### View Specific Service Logs

```bash
docker compose logs -f app      # Next.js app
docker compose logs -f aktools  # AKTools API
```

### Stop Services

```bash
docker compose down
```

### Stop and Remove Data

```bash
docker compose down -v
```

### Rebuild After Code Changes

```bash
docker compose up --build -d
```

### Check Status

```bash
docker compose ps
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Docker Network                  │
│                                                  │
│  ┌──────────────────┐    ┌──────────────────┐   │
│  │   StockViewer    │    │     AKTools      │   │
│  │   (Next.js)      │───▶│   (Python API)   │   │
│  │   Port: 3000     │    │   Port: 8080     │   │
│  └────────┬─────────┘    └──────────────────┘   │
│           │                                      │
│  ┌────────▼─────────┐                           │
│  │  Docker Volumes  │                           │
│  │  - csv data      │                           │
│  │  - indicators    │                           │
│  │  - strategies    │                           │
│  │  - groups        │                           │
│  │  - backtest      │                           │
│  │  - view-settings │                           │
│  └──────────────────┘                           │
└─────────────────────────────────────────────────┘
```

## Data Persistence

All data is stored in Docker volumes and persists between container restarts:

| Volume | Purpose |
|--------|---------|
| `stockviewer-csv` | Stock CSV data files |
| `stockviewer-indicators` | Custom indicator definitions |
| `stockviewer-strategies` | Trading strategy definitions |
| `stockviewer-groups` | Stock group definitions |
| `stockviewer-backtest` | Backtest history |
| `stockviewer-datasets` | Dataset metadata |
| `stockviewer-viewsettings` | View setting presets |

### Backup Data

```bash
# Create backup directory
mkdir -p backup

# Export volumes
docker run --rm -v stockviewer-csv:/data -v $(pwd)/backup:/backup alpine tar czf /backup/csv.tar.gz -C /data .
docker run --rm -v stockviewer-indicators:/data -v $(pwd)/backup:/backup alpine tar czf /backup/indicators.tar.gz -C /data .
# ... repeat for other volumes
```

### Restore Data

```bash
docker run --rm -v stockviewer-csv:/data -v $(pwd)/backup:/backup alpine tar xzf /backup/csv.tar.gz -C /data
# ... repeat for other volumes
```

## Troubleshooting

### AKTools Takes Long to Start

AKTools needs to download and initialize data on first run. Wait 2-3 minutes and check logs:

```bash
docker compose logs -f aktools
```

### Port Already in Use

Change ports in `docker-compose.yml`:

```yaml
services:
  app:
    ports:
      - "3001:3000"  # Change 3000 to 3001
  aktools:
    ports:
      - "8081:8080"  # Change 8080 to 8081
```

### Out of Memory

Increase Docker Desktop memory allocation:
- Docker Desktop → Settings → Resources → Memory → 4GB+

### Clean Rebuild

```bash
docker compose down -v
docker system prune -f
docker compose up --build -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_AKTOOLS_API_URL` | `http://aktools:8080` | AKTools API URL |
| `PYTHON_TIMEOUT_MS` | `300000` | Python execution timeout (5 min) |
| `NODE_ENV` | `production` | Node environment |

## Development Mode

For development with hot-reload, use the standard setup instead:

```bash
# In project root
npm install
npm run dev
```

See main [README.md](../README.md) and [SETUP.md](../SETUP.md) for development setup.
