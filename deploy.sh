#!/bin/bash
# deploy.sh — Run on your DigitalOcean droplet to deploy updates
# Usage: chmod +x deploy.sh && ./deploy.sh

set -e  # Exit on any error

APP_DIR="/var/www/postify"
LOG_DIR="/var/log/postify"

echo "🚀 Deploying Postify..."

if ! node -e "const [maj,min]=process.versions.node.split('.').map(Number); process.exit(maj>20 || (maj===20 && min>=9) ? 0 : 1)"; then
  echo "❌ Node 20.9+ is required. Current: $(node -v)"
  exit 1
fi

# Create dirs if first deploy
mkdir -p "$APP_DIR" "$LOG_DIR"
cd "$APP_DIR"

# Pull latest code
echo "📦 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📥 Installing dependencies..."
npm ci --production=false

# Generate Prisma client
echo "🗄️  Generating Prisma client..."
npx prisma generate

# Run pending DB migrations (safe — no data loss)
echo "🗄️  Running DB migrations..."
npx prisma migrate deploy

# Build Next.js
echo "🔨 Building..."
npm run build

# Restart with PM2 (zero-downtime reload)
echo "♻️  Restarting app..."
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "✅ Deploy complete!"
pm2 status
