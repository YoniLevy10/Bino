import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { PUSH_FETCH_TIMEOUT_MS, urlBase64ToUint8Array } from '@/lib/push-client-core'
import { ensureServiceWorkerReady, isStandaloneWorkerPwa } from '@/lib/service-worker-register'


let subscribeInflight: Promise<{ ok: boolean; error?: string }> | null = null


export function isWorkerPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getWorkerPushSubscription(): Promise<PushSubscription | null> {
  if (!isWorkerPushSupported()) return null
  try {
    await ensureServiceWorkerReady()
    const reg = await navigator.serviceWorker.ready
    return reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export const WORKER_PUSH_ENABLED_KEY = 'bamakor_worker_push_enabled'

export function markWorkerPushEnabled(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(WORKER_PUSH_ENABLED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearWorkerPushEnabled(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(WORKER_PUSH_ENABLED_KEY)
  } catch {
    /* ignore */
  }
}

export function hasWorkerPushEnabledFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(WORKER_PUSH_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function isWorkerPushEnabled(): boolean {
  if (!isWorkerPushSupported()) return false
  return Notification.permission === 'granted'
}

/** True when worker completed push setup — hide onboarding + bell. */
export async function isWorkerPushFullyEnabled(): Promise<boolean> {
  if (!isWorkerPushSupported()) return false
  if (Notification.permission === 'denied') {
    clearWorkerPushEnabled()
    return false
  }
  if (Notification.permission !== 'granted') return false
  const sub = await getWorkerPushSubscription()
  if (sub) {
    markWorkerPushEnabled()
    return true
  }
  clearWorkerPushEnabled()
  return false
}

export async function clearWorkerAppBadge(): Promise<void> {
  if (typeof navigator === 'undefined') return
  try {
    if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge()
    }
  } catch {
    /* unsupported platform */
  }
}

export async function setWorkerAppBadge(count: number): Promise<void> {
  if (typeof navigator === 'undefined' || count <= 0) return
  try {
    if ('setAppBadge' in navigator) {
      await navigator.setAppBadge(count)
    }
  } catch {
    /* unsupported platform */
  }
}

/** Persist push subscription JSON on server (no permission prompt). */
export async function registerWorkerPushOnServer(
  token: string,
  sub: PushSubscription
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchWithTimeout(
    '/api/worker/push/subscribe',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, subscription: sub.toJSON() }),
    },
    PUSH_FETCH_TIMEOUT_MS
  )
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: json.error || 'שמירה בשרת נכשלה' }
  return { ok: true }
}

/** Subscribe + persist worker push on server. Requires notification permission. */
export async function subscribeWorkerPush(token: string): Promise<{ ok: boolean; error?: string }> {
  if (subscribeInflight) return subscribeInflight

  subscribeInflight = subscribeWorkerPushInner(token).finally(() => {
    subscribeInflight = null
  })
  return subscribeInflight
}

async function subscribeWorkerPushInner(token: string): Promise<{ ok: boolean; error?: string }> {
  const vapid = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
  if (!vapid) return { ok: false, error: 'התראות לא מוגדרות בשרת' }
  if (!isWorkerPushSupported()) {
    return {
      ok: false,
      error: isStandaloneWorkerPwa()
        ? 'הדפדפן לא תומך בהתראות'
        : 'הוסיפו את האפליקציה למסך הבית ואז הפעילו התראות',
    }
  }

  try {
    await ensureServiceWorkerReady()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'הפעלת האפליקציה נכשלה' }
  }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    clearWorkerPushEnabled()
    return { ok: false, error: 'יש לאשר התראות כדי לקבל שיבוצים' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      })
    }

    const res = await fetchWithTimeout(
      '/api/worker/push/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, subscription: sub.toJSON() }),
      },
      PUSH_FETCH_TIMEOUT_MS
    )
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      clearWorkerPushEnabled()
      return { ok: false, error: json.error || 'שמירה בשרת נכשלה' }
    }

    markWorkerPushEnabled()
    return { ok: true }
  } catch (e) {
    clearWorkerPushEnabled()
    return { ok: false, error: e instanceof Error ? e.message : 'הפעלה נכשלה' }
  }
}

/** Re-sync existing subscription to server after PWA relaunch (no duplicate calls). */
export async function syncWorkerPushIfGranted(token: string): Promise<boolean> {
  if (!token || Notification.permission !== 'granted' || !isWorkerPushSupported()) return false
  try {
    const sub = await getWorkerPushSubscription()
    if (!sub) return false
    if (hasWorkerPushEnabledFlag()) return true
    const result = await registerWorkerPushOnServer(token, sub)
    if (result.ok) markWorkerPushEnabled()
    return result.ok
  } catch {
    return false
  }
}
