import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const outputArray = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) outputArray[i] = raw.charCodeAt(i)
  return outputArray
}

export function isWorkerPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getWorkerPushSubscription(): Promise<PushSubscription | null> {
  if (!isWorkerPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export function isWorkerPushEnabled(): boolean {
  if (!isWorkerPushSupported()) return false
  return Notification.permission === 'granted'
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

/** Subscribe + persist worker push on server. Requires notification permission. */
export async function subscribeWorkerPush(token: string): Promise<{ ok: boolean; error?: string }> {
  const vapid = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
  if (!vapid) return { ok: false, error: 'התראות לא מוגדרות בשרת' }
  if (!isWorkerPushSupported()) {
    return { ok: false, error: 'הדפדפן לא תומך בהתראות — הוסיפו את האפליקציה למסך הבית' }
  }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    return { ok: false, error: 'יש לאשר התראות כדי לקבל שיבוצים' }
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    })
  }

  const res = await fetchWithTimeout('/api/worker/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, subscription: sub.toJSON() }),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { ok: false, error: json.error || 'שמירה נכשלה' }
  return { ok: true }
}

/** Re-sync existing subscription to server after PWA relaunch. */
export async function syncWorkerPushIfGranted(token: string): Promise<void> {
  if (!token || Notification.permission !== 'granted' || !isWorkerPushSupported()) return
  try {
    await subscribeWorkerPush(token)
  } catch {
    /* silent */
  }
}
