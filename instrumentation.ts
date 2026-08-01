export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize the Bull queue processor and run scheduled-job
    // reconciliation exactly once at server startup — NOT from the route
    // handlers' dynamic import of lib/scheduler (which would race with
    // the route's own scheduledJob.create()).
    const { getPublishQueue, reconcileScheduledJobs } = await import('./lib/scheduler')
    getPublishQueue()
    reconcileScheduledJobs()
  }
}
