/** Default timeout for browser `fetch` calls (ms). */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

/** Longer timeout for create/update mutations that chain several server DB calls. */
export const MUTATION_FETCH_TIMEOUT_MS = 30_000

export const FETCH_TIMEOUT_USER_MESSAGE = 'הבקשה ארכה זמן מדי — נסה שוב'

export function isFetchTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === FETCH_TIMEOUT_USER_MESSAGE
}

/**
 * `fetch` with an AbortController timeout. On timeout, rejects with an Error
 * whose message is suitable for user-facing toasts (Hebrew).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(FETCH_TIMEOUT_USER_MESSAGE)
    }
    throw e
  } finally {
    clearTimeout(id)
  }
}
