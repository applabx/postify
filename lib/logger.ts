/**
 * Minimal structured JSON logger.
 *
 * Every log line is a single JSON object with a timestamp, level, message,
 * and correlation fields (requestId, jobId, postId, platformId, workerId).
 * No tokens, secrets, or PII are ever logged.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  requestId?: string
  jobId?: string
  postId?: string
  platformId?: string
  workerId?: string
  userId?: string
  [key: string]: string | number | boolean | null | undefined
}

const WORKER_ID =
  (typeof process !== 'undefined' && process.pid ? `pid:${process.pid}` : 'pid:n/a') +
  (process.env.POD_NAME ? ` pod:${process.env.POD_NAME}` : '')

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    workerId: WORKER_ID,
    ...fields,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => log('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => log('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => log('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => log('error', msg, fields),
}

/**
 * Reads the request id set by the middleware (x-request-id) for correlating
 * server-side log lines with a single HTTP request. Safe to call outside a
 * request context (returns undefined).
 */
export async function getRequestId(): Promise<string | undefined> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    return h.get('x-request-id') ?? undefined
  } catch {
    return undefined
  }
}
