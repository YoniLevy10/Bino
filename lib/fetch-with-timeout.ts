/** Default timeout for browser `fetch` calls (ms). */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

/** Longer timeout for create/update mutations that chain several server DB calls. */
export const MUTATION_FETCH_TIMEOUT_MS = 30_000

/** Photo upload + WhatsApp send on worker close can take 30–60s on mobile networks. */
export const WORKER_PHOTO_TIMEOUT_MS = 90_000

/** Campaigns / broadcasts / bulk SMS — keep UI waiting longer than default mutation. */
export const LONG_RUNNING_FETCH_TIMEOUT_MS = 60_000

export const FETCH_TIMEOUT_USER_MESSAGE = 'הפעולה לוקחת יותר מהרגיל — בדקו אם נשמרה ורעננו'

export function isFetchTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === FETCH_TIMEOUT_USER_MESSAGE
}

/**
 * `fetch` with an AbortController timeout. On timeout, rejects with an Error
 * whose message is suitable for user-facing toasts (Hebrew).
 * Honors an existing `init.signal` (e.g. React Query) in addition to the timeout.
 * Uses Promise.race so we still reject if the platform ignores AbortSignal.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const timeoutController = new AbortController()
  const upstream = init.signal

  if (upstream?.aborted) {
    throw upstream.reason instanceof Error
      ? upstream.reason
      : new DOMException('Aborted', 'AbortError')
  }

  const onUpstreamAbort = () => timeoutController.abort()
  upstream?.addEventListener('abort', onUpstreamAbort, { once: true })

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timeoutController.abort()
      reject(new Error(FETCH_TIMEOUT_USER_MESSAGE))
    }, timeoutMs)
  })

  const fetchPromise = fetch(input, { ...init, signal: timeoutController.signal })

  try {
    return await Promise.race([fetchPromise, timeoutPromise])
  } catch (e) {
    if (upstream?.aborted) {
      throw upstream.reason instanceof Error
        ? upstream.reason
        : new DOMException('Aborted', 'AbortError')
    }
    if (e instanceof Error && e.message === FETCH_TIMEOUT_USER_MESSAGE) {
      throw e
    }
    if (timeoutController.signal.aborted) {
      throw new Error(FETCH_TIMEOUT_USER_MESSAGE)
    }
    throw e
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    upstream?.removeEventListener('abort', onUpstreamAbort)
    // If timeout won the race, the aborted fetch rejection must not become unhandled.
    void fetchPromise.catch(() => {})
  }
}
