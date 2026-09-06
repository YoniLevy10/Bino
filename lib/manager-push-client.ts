import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import {
  ensureServiceWorkerReady,
  isIosSafariLike,
  isStandalonePwa,
} from '@/lib/service-worker-register'

const PUSH_FETCH_TIMEOUT_MS = 30_000

let subscribeInflight: Promise<{ ok: boolean; error?: string }> | null = null

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const outputArray = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i)
  }
  return outputArray
}

export function isManagerPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getManagerPushSubscription(): Promise<PushSubscription | null> {
  if (!isManagerPushSupported()) return null
  try {
    await ensureServiceWorkerReady()
    const reg = await navigator.serviceWorker.ready
    return reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export const MANAGER_PUSH_ENABLED_KEY = 'bamakor_manager_push_enabled'

export function markManagerPushEnabled(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MANAGER_PUSH_ENABLED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearManagerPushEnabled(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(MANAGER_PUSH_ENABLED_KEY)
  } catch {
    /* ignore */
  }
}

export function hasManagerPushEnabledFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(MANAGER_PUSH_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

/** True when manager completed push setup — hide onboarding. */
export async function isManagerPushFullyEnabled(): Promise<boolean> {
  if (!isManagerPushSupported()) return false
  if (Notification.permission === 'denied') {
    clearManagerPushEnabled()
    return false
  }
  if (Notification.permission !== 'granted') return false
  const sub = await getManagerPushSubscription()
  if (sub) {
    markManagerPushEnabled()
    return true
  }
  clearManagerPushEnabled()
  return false
}

export function getManagerPushBlockedReason(): string | null {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) {
    return 'הדפדפן לא תומך בהתראות'
  }
  if (!('PushManager' in window)) {
    if (isIosSafariLike() && !isStandalonePwa()) {
      return 'באייפון: שיתוף → «הוסף למסך הבית», ואז פתחו מהאייקון והפעילו התראות'
    }
    return 'הוסיפו את האפליקציה למסך הבית ואז הפעילו התראות'
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    return 'ההתראות חסומות בהגדרות המכשיר / הדפדפן. הפעילו אותן עבור Bino.'
  }
  return null
}

/** Persist push subscription JSON on server (no permission prompt). */
export async function registerManagerPushOnServer(
  sub: PushSubscription
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchWithTimeout(
    '/api/push/subscribe',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    },
    PUSH_FETCH_TIMEOUT_MS
  )
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: json.error || 'שמירה בשרת נכשלה' }
  return { ok: true }
}

/** Subscribe + persist manager push on server. Requires notification permission. */
export async function subscribeManagerPush(): Promise<{ ok: boolean; error?: string }> {
  if (subscribeInflight) return subscribeInflight

  subscribeInflight = subscribeManagerPushInner().finally(() => {
    subscribeInflight = null
  })
  return subscribeInflight
}

async function subscribeManagerPushInner(): Promise<{ ok: boolean; error?: string }> {
  const vapid = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
  if (!vapid) return { ok: false, error: 'התראות לא מוגדרות בשרת' }

  if (!isManagerPushSupported()) {
    return {
      ok: false,
      error: getManagerPushBlockedReason() || 'הדפדפן לא תומך בהתראות דחיפה',
    }
  }

  try {
    await ensureServiceWorkerReady()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'הפעלת האפליקציה נכשלה' }
  }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    clearManagerPushEnabled()
    return { ok: false, error: 'יש לאשר התראות כדי לקבל טיקטים חדשים' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      })
    }

    const result = await registerManagerPushOnServer(sub)
    if (!result.ok) {
      clearManagerPushEnabled()
      return result
    }

    markManagerPushEnabled()
    return { ok: true }
  } catch (e) {
    clearManagerPushEnabled()
    const msg = e instanceof Error ? e.message : 'הפעלה נכשלה'
    if (/push service error/i.test(msg)) {
      return {
        ok: false,
        error: 'בדפדפן Brave: הפעילו «Use Google services for push messaging» בהגדרות פרטיות',
      }
    }
    return { ok: false, error: msg }
  }
}

/** Re-sync existing subscription to server after PWA relaunch. */
export async function syncManagerPushIfGranted(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission !== 'granted' || !isManagerPushSupported()) return false
  try {
    const sub = await getManagerPushSubscription()
    if (!sub) return false
    if (hasManagerPushEnabledFlag()) return true
    const result = await registerManagerPushOnServer(sub)
    if (result.ok) markManagerPushEnabled()
    return result.ok
  } catch {
    return false
  }
}
