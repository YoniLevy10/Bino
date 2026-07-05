export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    return res
  } catch (err) {
    clearTimeout(timeout)
    if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
      console.warn('External API timeout:', url)
      return null
    }
    throw err
  }
}

