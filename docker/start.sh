#!/bin/bash

# StockViewer Docker Start Script
# One-click build and run

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================================"
echo "  StockViewer - Docker One-Click Build"
echo "================================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed."
    echo "Please install Docker from https://www.docker.com/get-started"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "Error: Docker Compose is not available."
    echo "Please ensure Docker Desktop is installed and running."
    exit 1
fi

# Copy .dockerignore to project root for build context
cp "$SCRIPT_DIR/.dockerignore" "$SCRIPT_DIR/../.dockerignore.docker"

echo "Building Docker images..."
echo "This may take several minutes on first run."
echo ""

# Build and start containers
docker compose up --build -d

# Remove temporary dockerignore
rm -f "$SCRIPT_DIR/../.dockerignore.docker"

echo ""
echo "================================================"
echo "  StockViewer is starting!"
echo "================================================"
echo ""
echo "  App URL:     http://localhost:3000"
echo "  AKTools API: http://localhost:8080"
echo ""
echo "  Note: AKTools may take 1-2 minutes to fully start."
echo "        Wait for the health check to pass."
echo ""
echo "  Commands:"
echo "    View logs:    docker compose logs -f"
echo "    Stop:         docker compose down"
echo "    Stop & clean: docker compose down -v"
echo ""

# Wait and show status
echo "Waiting for services to be ready..."
sleep 5

docker compose ps

echo ""
echo "Check logs with: cd docker && docker compose logs -f"
