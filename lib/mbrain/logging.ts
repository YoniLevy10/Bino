/**
 * Structured logging for Marketing Brain — never log access tokens.
 */
const SENSITIVE_KEY = /(token|secret|password|authorization|api[_-]?key|access_token)/i

export function sanitizeMbrainLogValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]'
  if (value == null) return value
  if (typeof value === 'string') {
    if (value.length > 500) return `${value.slice(0, 120)}…[len=${value.length}]`
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeMbrainLogValue(v, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : sanitizeMbrainLogValue(v, depth + 1)
    }
    return out
  }
  return value
}

export function mbrainLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  meta?: Record<string, unknown>
): void {
  const payload = {
    scope: 'mbrain',
    event,
    ...(meta ? (sanitizeMbrainLogValue(meta) as Record<string, unknown>) : {}),
  }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
