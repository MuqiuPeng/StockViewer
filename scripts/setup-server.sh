#!/bin/bash
# Complete server setup script for GCP VM
# Run: curl -fsSL <raw-github-url> | bash

set -e

echo "=========================================="
echo "  StockViewer Server Setup"
echo "=========================================="

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo "Please run as a regular user with sudo access, not root"
  exit 1
fi

# Update system
echo ""
echo ">>> [1/6] Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
echo ""
echo ">>> [2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  rm get-docker.sh
fi

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Install Nginx
echo ""
echo ">>> [3/6] Installing Nginx..."
sudo apt-get install -y nginx

# Install Git
sudo apt-get install -y git

# Clone repository
echo ""
echo ">>> [4/6] Setting up application..."
APP_DIR=~/stockviewer
mkdir -p $APP_DIR

read -p "Enter Git repository URL (or press Enter to skip): " REPO_URL
if [ -n "$REPO_URL" ]; then
  git clone $REPO_URL $APP_DIR
  cd $APP_DIR
fi

# Configure environment
echo ""
echo ">>> [5/6] Configuring environment..."
if [ -f "$APP_DIR/docker/.env.production.example" ]; then
  cp $APP_DIR/docker/.env.production.example $APP_DIR/docker/.env.production

  # Generate secrets
  AUTH_SECRET=$(openssl rand -base64 32)
  PG_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

  read -p "Enter your full URL (e.g., https://robindev.org/stockviewer): " AUTH_URL

  sed -i "s|AUTH_SECRET=your-secret-key-here|AUTH_SECRET=$AUTH_SECRET|g" $APP_DIR/docker/.env.production
  sed -i "s|AUTH_URL=https://your-domain.com|AUTH_URL=$AUTH_URL|g" $APP_DIR/docker/.env.production
  sed -i "s|POSTGRES_PASSWORD=change-this-strong-password|POSTGRES_PASSWORD=$PG_PASSWORD|g" $APP_DIR/docker/.env.production

  echo "Environment configured. Edit for OAuth: nano $APP_DIR/docker/.env.production"
fi

# Configure Nginx
echo ""
echo ">>> [6/6] Configuring Nginx..."
read -p "Enter your domain (e.g., robindev.org): " DOMAIN

sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /stockviewer {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    location / {
        return 404;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "IMPORTANT: Log out and log back in for Docker permissions!"
echo ""
echo "After logging back in, run:"
echo "  cd ~/stockviewer/docker"
echo "  docker compose -f docker-compose.production.yml --env-file .env.production up -d --build"
echo ""
echo "Then configure Cloudflare:"
echo "  1. Add A record: @ -> YOUR_SERVER_IP"
echo "  2. Set SSL/TLS to 'Flexible' or 'Full'"
echo "  3. Enable 'Always Use HTTPS'"
echo ""
