/**
 * In-memory OTP handoff for local scraper runs (One Zero / Pepper-style).
 * sync-now waits here; UI POSTs the code when the user receives SMS.
 */

type Waiter = {
  resolve: (code: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const waiters = new Map<string, Waiter>()
const pendingCodes = new Map<string, string>()

function key(clientId: string, projectId: string): string {
  return `${clientId}:${projectId}`
}

/** Called from sync-now otpCodeRetriever — blocks until UI submits OTP or timeout. */
export function waitForScraperOtp(params: {
  clientId: string
  projectId: string
  timeoutMs?: number
}): Promise<string> {
  const k = key(params.clientId, params.projectId)
  const existing = pendingCodes.get(k)
  if (existing) {
    pendingCodes.delete(k)
    return Promise.resolve(existing)
  }

  return new Promise((resolve, reject) => {
    const prev = waiters.get(k)
    if (prev) {
      clearTimeout(prev.timer)
      prev.reject(new Error('המתנה ל־OTP הוחלפה'))
    }
    const timer = setTimeout(() => {
      waiters.delete(k)
      reject(new Error('פג הזמן להזנת קוד OTP (שתי דקות)'))
    }, params.timeoutMs ?? 120_000)
    waiters.set(k, { resolve, reject, timer })
  })
}

/** UI submits OTP while scrape is waiting. */
export function submitScraperOtp(params: {
  clientId: string
  projectId: string
  code: string
}): { ok: true } | { ok: false; error: string } {
  const code = params.code.replace(/\s+/g, '').trim()
  if (!code || code.length < 4) {
    return { ok: false, error: 'קוד OTP לא תקין' }
  }
  const k = key(params.clientId, params.projectId)
  const waiter = waiters.get(k)
  if (waiter) {
    clearTimeout(waiter.timer)
    waiters.delete(k)
    waiter.resolve(code)
    return { ok: true }
  }
  // Scrape not waiting yet — stash for a few seconds
  pendingCodes.set(k, code)
  setTimeout(() => pendingCodes.delete(k), 120_000)
  return { ok: true }
}

export function cancelScraperOtpWait(clientId: string, projectId: string) {
  const k = key(clientId, projectId)
  const waiter = waiters.get(k)
  if (waiter) {
    clearTimeout(waiter.timer)
    waiters.delete(k)
    waiter.reject(new Error('בוטל'))
  }
  pendingCodes.delete(k)
}
