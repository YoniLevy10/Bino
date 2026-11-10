/** Matches the client beacon window in PageViewTracker. */
export const PAGE_VIEW_DEDUP_MS = 15 * 60_000

const recent = new Map<string, number>()
const MAX_KEYS = 5_000

export function pageViewDedupeKey(clientId: string, userId: string, navId: string, path: string): string {
  return `${clientId}\n${userId}\n${navId}\n${path}`
}

/** True when no write for this key landed inside the window. Does not reserve the slot. */
export function shouldRecordPageView(key: string, now = Date.now()): boolean {
  const prev = recent.get(key)
  return prev == null || now - prev >= PAGE_VIEW_DEDUP_MS
}

export function rememberPageView(key: string, now = Date.now()): void {
  if (recent.size >= MAX_KEYS) {
    const cutoff = now - PAGE_VIEW_DEDUP_MS
    for (const [storedKey, at] of recent) {
      if (at < cutoff) recent.delete(storedKey)
    }
    if (recent.size >= MAX_KEYS) recent.clear()
  }
  recent.set(key, now)
}

export function resetPageViewWriteDedupeForTests(): void {
  recent.clear()
}
