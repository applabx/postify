export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry first so any startup failure below is captured.
    const { initSentryServer } = await import('./lib/sentry')
    initSentryServer()

    // Initialize the Bull queue and run scheduled-job reconciliation exactly
    // once at server startup — NOT from the route handlers' dynamic import of
    // lib/scheduler (which would race with the route's own scheduledJob.create()).
    const { getPublishQueue, reconcileScheduledJobs, registerPublishProcessor, queueShouldProcessLocally } =
      await import('./lib/scheduler')

    const queue = getPublishQueue()

    // Processing mode:
    //   PUBLISH_WORKER=true  → dedicated worker container owns processing
    //   PUBLISH_WORKER=false → web never processes (split deployment)
    //   unset                → legacy: web processes (backwards compatible)
    if (queueShouldProcessLocally()) {
      registerPublishProcessor(queue)
    }
    reconcileScheduledJobs()

    // ─── Graceful shutdown (web) ─────────────────────────────────────────
    // The Next.js standalone server handles SIGTERM itself (stops accepting
    // connections, drains in-flight requests, exits). We only need to stop
    // pulling new queue jobs when this process processes them — active jobs
    // finish naturally, and remaining connections close on process exit.
    if (queueShouldProcessLocally()) {
      const pauseQueue = () => {
        queue.pause(true).catch(() => {})
      }
      process.once('SIGTERM', pauseQueue)
      process.once('SIGINT', pauseQueue)
    }

    // Capture unhandled errors for production monitoring (no-op without DSN).
    const { safeCaptureException } = await import('./lib/sentry')
    process.on('uncaughtException', (err) => {
      console.error('[App] uncaughtException:', err)
      safeCaptureException(err, { phase: 'web-uncaughtException' })
    })
    process.on('unhandledRejection', (reason) => {
      const err = reason instanceof Error ? reason : new Error(String(reason))
      console.error('[App] unhandledRejection:', err.message)
      safeCaptureException(err, { phase: 'web-unhandledRejection' })
    })
  }
}
