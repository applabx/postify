import { oauthAttempts } from '@/lib/metrics'
import { safeCaptureException } from '@/lib/sentry'

// OAuth telemetry helper: every platform flow reports attempt metrics and
// (on failure) a Sentry event. No tokens or PII are included — platform name,
// phase, and result only.

export function oauthEvent(platform: string, phase: string, result: string): void {
  oauthAttempts.inc({ platform, phase, result })
}

export function oauthError(platform: string, phase: string, err: unknown): void {
  oauthEvent(platform, phase, 'failure')
  safeCaptureException(err, { phase: `oauth-${phase}`, platform })
}
