#!/bin/bash
# StockViewer GCP Deployment Script
# Run this on your Google Compute Engine VM

set -e

echo "=== StockViewer GCP Deployment ==="

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo "Please run as a regular user, not root"
  exit 1
fi

# Update system
echo ">>> Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
  echo ">>> Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  rm get-docker.sh
  echo ">>> Docker installed. Please log out and log back in, then run this script again."
  exit 0
fi

# Install Docker Compose if not installed
if ! command -v docker compose &> /dev/null; then
  echo ">>> Installing Docker Compose..."
  sudo apt-get install -y docker-compose-plugin
fi

# Create app directory
APP_DIR=~/stockviewer
echo ">>> Setting up application in $APP_DIR..."
mkdir -p $APP_DIR
cd $APP_DIR

# Clone or pull repository
if [ -d ".git" ]; then
  echo ">>> Pulling latest changes..."
  git pull
else
  echo ">>> Cloning repository..."
  read -p "Enter your Git repository URL: " REPO_URL
  git clone $REPO_URL .
fi

# Setup environment file
if [ ! -f "docker/.env.production" ]; then
  echo ">>> Creating production environment file..."
  cp docker/.env.production.example docker/.env.production

  # Generate AUTH_SECRET
  AUTH_SECRET=$(openssl rand -base64 32)
  sed -i "s|AUTH_SECRET=your-secret-key-here|AUTH_SECRET=$AUTH_SECRET|g" docker/.env.production

  # Set AUTH_URL
  read -p "Enter your domain (e.g., https://robindev.org/stockviewer): " AUTH_URL
  sed -i "s|AUTH_URL=https://your-domain.com|AUTH_URL=$AUTH_URL|g" docker/.env.production

  # Generate PostgreSQL password
  PG_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
  sed -i "s|POSTGRES_PASSWORD=change-this-strong-password|POSTGRES_PASSWORD=$PG_PASSWORD|g" docker/.env.production

  echo ""
  echo ">>> Environment file created at docker/.env.production"
  echo ">>> Please edit it to add your OAuth credentials (optional):"
  echo "    nano docker/.env.production"
  echo ""
fi

# Build and start containers
echo ">>> Building and starting containers..."
cd docker
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build

# Run database migrations
echo ">>> Running database migrations..."
sleep 10  # Wait for database to be ready
docker compose -f docker-compose.production.yml exec stockviewer npx prisma migrate deploy

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "StockViewer is now running on port 3000"
echo ""
echo "Next steps:"
echo "1. Configure Cloudflare DNS to point to this server"
echo "2. Set up a reverse proxy (nginx) for /stockviewer path"
echo "3. Configure SSL via Cloudflare"
echo ""
echo "To view logs: docker compose -f docker-compose.production.yml logs -f"
echo "To stop: docker compose -f docker-compose.production.yml down"
