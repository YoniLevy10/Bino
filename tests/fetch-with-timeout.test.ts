import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  FETCH_TIMEOUT_USER_MESSAGE,
  fetchWithTimeout,
} from '@/lib/fetch-with-timeout'

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('aborts with Hebrew timeout message after timeoutMs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })
    )

    await expect(fetchWithTimeout('/api/x', {}, 20)).rejects.toThrow(FETCH_TIMEOUT_USER_MESSAGE)
  })

  it('propagates upstream AbortSignal without pretending it was a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })
    )

    const upstream = new AbortController()
    const pending = fetchWithTimeout('/api/x', { signal: upstream.signal }, 30_000)
    queueMicrotask(() => upstream.abort())
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
