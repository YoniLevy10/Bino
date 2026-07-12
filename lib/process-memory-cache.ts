/**
 * Short-lived in-process TTL cache for hot server paths (webhooks, tenant lookup).
 * Not shared across Vercel instances — safe best-effort dedupe of repeated reads.
 */

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

export function createProcessMemoryCache<T>(defaultTtlMs: number) {
  const store = new Map<string, CacheEntry<T>>()

  function get(key: string): T | undefined {
    const row = store.get(key)
    if (!row) return undefined
    if (Date.now() >= row.expiresAt) {
      store.delete(key)
      return undefined
    }
    return row.value
  }

  function set(key: string, value: T, ttlMs: number = defaultTtlMs): void {
    store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  function deleteKey(key: string): void {
    store.delete(key)
  }

  function clear(): void {
    store.clear()
  }

  return { get, set, delete: deleteKey, clear }
}
