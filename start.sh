#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Create it first: cp .env.example .env"
  exit 1
fi

# Default to Dockerized app runtime to avoid macOS native binary signature issues
# (Prisma/SWC/LightningCSS). Set START_MODE=local to force host runtime.
if [ "${START_MODE:-docker}" = "docker" ]; then
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      echo "Starting Postify in Docker (db + redis + app)..."
      docker compose --profile app up --build
      exit 0
    elif command -v docker-compose >/dev/null 2>&1; then
      echo "Starting Postify in Docker (db + redis + app)..."
      docker-compose --profile app up --build
      exit 0
    fi
  fi
  echo "Docker Compose not available; falling back to local runtime."
fi

NODE_VERSION="$(node -v 2>/dev/null || true)"
if [ -z "$NODE_VERSION" ]; then
  echo "Node.js is not installed. Install Node 20.9+ first."
  exit 1
fi

if ! node scripts/check-node-version.cjs >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    if [ -f ".nvmrc" ]; then
      echo "Switching Node version via nvm (.nvmrc)..."
      nvm use >/dev/null || nvm install >/dev/null || nvm install 20 >/dev/null
    fi
  fi
fi

node scripts/check-node-version.cjs

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm ci --include=optional
fi

if [ ! -f "node_modules/lightningcss-darwin-arm64/lightningcss.darwin-arm64.node" ] || \
   [ ! -f "node_modules/@next/swc-darwin-arm64/next-swc.darwin-arm64.node" ]; then
  echo "Repairing missing native optional dependencies..."
  npm ci --include=optional
fi

# lightningcss tries optional package first, then falls back to this local binary path.
# Ensure fallback path exists to avoid CSS build failures on some npm/macOS setups.
if [ -f "node_modules/lightningcss-darwin-arm64/lightningcss.darwin-arm64.node" ] && \
   [ ! -f "node_modules/lightningcss/lightningcss.darwin-arm64.node" ]; then
  echo "Linking Lightning CSS native binary fallback..."
  ln -sf "../lightningcss-darwin-arm64/lightningcss.darwin-arm64.node" \
    "node_modules/lightningcss/lightningcss.darwin-arm64.node" || \
  cp "node_modules/lightningcss-darwin-arm64/lightningcss.darwin-arm64.node" \
    "node_modules/lightningcss/lightningcss.darwin-arm64.node"
fi

# macOS can quarantine native binaries restored from downloaded caches.
# Clear quarantine attrs so Node can dlopen native addons (SWC, LightningCSS, Prisma).
if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine node_modules 2>/dev/null || true
fi

# On some macOS setups, native addons still fail with Team ID mismatch after install.
# Apply ad-hoc signatures so Node can dlopen Prisma/SWC/LightningCSS binaries.
if [ "$(uname -s)" = "Darwin" ] && command -v codesign >/dev/null 2>&1; then
  find node_modules -type f \( -name "*.node" -o -name "*.dylib" \) -print0 2>/dev/null | \
    xargs -0 -I{} codesign --force --sign - "{}" >/dev/null 2>&1 || true
fi

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    echo "Starting Postgres + Redis (docker compose)..."
    docker compose up -d db redis
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "Starting Postgres + Redis (docker-compose)..."
    docker-compose up -d db redis
  else
    echo "Docker found, but compose is unavailable."
  fi
else
  echo "Docker not found. Assuming Postgres/Redis are already running."
fi

echo "Generating Prisma client..."
npx prisma generate

echo "Running pending migrations..."
npx prisma migrate deploy || {
  echo "----------------------------------------------"
  echo "Migration deploy failed."
  echo "If you previously used 'db push', run once:"
  echo "  npx prisma migrate resolve --applied 20260729_init"
  echo "Then re-run this script."
  echo "----------------------------------------------"
  exit 1
}

echo "Starting app on http://localhost:3000"
exec npm run dev
