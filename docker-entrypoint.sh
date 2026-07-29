#!/bin/sh
set -e

echo "[Postify] Running database migrations..."
npx prisma migrate deploy

echo "[Postify] Starting application..."
exec node server.js
