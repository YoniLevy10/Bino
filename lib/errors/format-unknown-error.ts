/**
 * Turn unknown thrown values into readable strings for logs / ops alerts.
 * Supabase PostgREST errors are often plain `{ message, code, details, hint }`
 * objects (not `Error` instances) — `String(err)` becomes `[object Object]`.
 */

export type FormattedUnknownError = {
  message: string
  stack?: string
  /** Extra fields safe to put in system_logs.payload / alert details */
  meta?: Record<string, unknown>
}

function tryJsonStringify(value: unknown): string | null {
  try {
    const s = JSON.stringify(value)
    return typeof s === 'string' ? s : null
  } catch {
    return null
  }
}

function messageFromObject(obj: Record<string, unknown>): string | null {
  const message = obj.message
  if (typeof message === 'string' && message.trim() && message !== '[object Object]') {
    const parts = [message.trim()]
    if (typeof obj.code === 'string' && obj.code) parts.push(`code=${obj.code}`)
    if (typeof obj.details === 'string' && obj.details) parts.push(obj.details)
    if (typeof obj.hint === 'string' && obj.hint) parts.push(obj.hint)
    return parts.join(' | ')
  }
  if (typeof message === 'object' && message !== null) {
    const nested = tryJsonStringify(message)
    if (nested) return nested.slice(0, 2000)
  }
  const nestedError = obj.error
  if (typeof nestedError === 'string' && nestedError.trim()) return nestedError.trim()
  if (nestedError && typeof nestedError === 'object') {
    const fromNested = messageFromObject(nestedError as Record<string, unknown>)
    if (fromNested) return fromNested
  }
  return null
}

/** Human-readable one-line (or short) message for emails / system_logs.message */
export function formatUnknownErrorMessage(err: unknown): string {
  return formatUnknownError(err).message
}

/** Full structured formatting for logs + optional stack/meta */
export function formatUnknownError(err: unknown): FormattedUnknownError {
  if (err instanceof Error) {
    const message =
      err.message && err.message !== '[object Object]'
        ? err.message
        : err.name || 'Error'
    const meta: Record<string, unknown> = { name: err.name }
    const anyErr = err as Error & { code?: unknown; details?: unknown; hint?: unknown; cause?: unknown }
    if (typeof anyErr.code === 'string') meta.code = anyErr.code
    if (typeof anyErr.details === 'string') meta.details = anyErr.details
    if (typeof anyErr.hint === 'string') meta.hint = anyErr.hint
    if (anyErr.cause !== undefined) {
      meta.cause = formatUnknownErrorMessage(anyErr.cause)
    }
    // Error with useless message — try JSON of own enumerable fields
    if (err.message === '[object Object]') {
      const json = tryJsonStringify(err)
      if (json && json !== '{}') {
        return {
          message: json.slice(0, 2000),
          stack: err.stack,
          meta,
        }
      }
    }
    return {
      message: message.slice(0, 2000),
      stack: err.stack,
      meta,
    }
  }

  if (typeof err === 'string') {
    return { message: err.slice(0, 2000) }
  }

  if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') {
    return { message: String(err) }
  }

  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    const fromFields = messageFromObject(obj)
    if (fromFields) {
      const meta: Record<string, unknown> = {}
      if (typeof obj.code === 'string') meta.code = obj.code
      if (typeof obj.details === 'string') meta.details = obj.details
      if (typeof obj.hint === 'string') meta.hint = obj.hint
      return {
        message: fromFields.slice(0, 2000),
        stack: typeof obj.stack === 'string' ? obj.stack : undefined,
        meta: Object.keys(meta).length ? meta : undefined,
      }
    }
    const json = tryJsonStringify(err)
    if (json) {
      return { message: json.slice(0, 2000) }
    }
  }

  if (err === null || err === undefined) {
    return { message: String(err) }
  }

  return { message: Object.prototype.toString.call(err) }
}

/** Re-throw supabase-style plain errors as real Error instances (preserves message). */
export function toError(err: unknown): Error {
  if (err instanceof Error) return err
  const formatted = formatUnknownError(err)
  const out = new Error(formatted.message)
  if (formatted.stack) out.stack = formatted.stack
  if (formatted.meta) {
    Object.assign(out, formatted.meta)
  }
  return out
}
