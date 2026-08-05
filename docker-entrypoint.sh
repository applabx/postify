#!/bin/sh
set -e

export POSTIFY_STARTED_AT=$(date +%s%3N)

echo "[Postify] Running database migrations..."
# Direct invocation of the Prisma CLI shipped in the image. Avoids npx/npm
# entirely: no registry download, no $HOME/.npm cache requirement, no
# network dependency at container startup.
node ./node_modules/prisma/build/index.js migrate deploy

echo "[Postify] Starting application..."
exec node server.js
