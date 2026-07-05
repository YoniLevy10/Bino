import {
  fetchWithTimeout,
  isFetchTimeoutError,
  FETCH_TIMEOUT_USER_MESSAGE,
} from '@/lib/fetch-with-timeout'

/** Load inbox / thread history — tolerate slow mobile networks. */
export const WHATSAPP_READ_TIMEOUT_MS = 25_000

/**
 * Send reply / template — server may call Meta twice (template + text fallback).
 * Must exceed 2× Meta API timeout + DB work.
 */
export const WHATSAPP_MUTATION_TIMEOUT_MS = 55_000

const MUTATION_RETRY_DELAY_MS = 1_500
const MUTATION_MAX_ATTEMPTS = 2

export async function whatsappUiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  return fetchWithTimeout(input, init, WHATSAPP_READ_TIMEOUT_MS)
}

/** POST to WhatsApp APIs — one automatic retry on client timeout. */
export async function whatsappUiMutate(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MUTATION_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchWithTimeout(input, init, WHATSAPP_MUTATION_TIMEOUT_MS)
    } catch (e) {
      lastError = e
      if (!isFetchTimeoutError(e) || attempt >= MUTATION_MAX_ATTEMPTS) {
        throw e
      }
      await new Promise((resolve) => setTimeout(resolve, MUTATION_RETRY_DELAY_MS))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(FETCH_TIMEOUT_USER_MESSAGE)
}
