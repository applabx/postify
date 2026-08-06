// Dedicated publish worker entrypoint.
//
// Usage:  node dist/worker/worker.js   (built by scripts/build-worker.mjs)
//
// Env:
//   PUBLISH_WORKER=true  (this process owns queue processing)
//   DATABASE_URL, REDIS_URL — standard app env
//   SENTRY_DSN (optional), SOURCE_COMMIT (release tag)
import { startWorker } from '../lib/worker'

startWorker().catch((err) => {
  console.error('[Worker] Fatal startup error:', err)
  process.exit(1)
})
