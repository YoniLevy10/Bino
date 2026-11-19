/** Shared Web Push client primitives (manager + worker). */

export const PUSH_FETCH_TIMEOUT_MS = 30_000

export function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const outputArray = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i)
  }
  return outputArray
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Clear home-screen / dock app badge (PWA Badging API). */
export async function clearAppBadgeBestEffort(): Promise<void> {
  if (typeof navigator === 'undefined') return
  try {
    if ('clearAppBadge' in navigator) {
      await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge()
    }
  } catch {
    /* unsupported */
  }
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const clear = (reg as ServiceWorkerRegistration & { clearAppBadge?: () => Promise<void> }).clearAppBadge
    if (typeof clear === 'function') await clear.call(reg)
  } catch {
    /* unsupported */
  }
}

/** Close visible Web Push notifications so they don't linger after the user opens the app. */
export async function dismissVisiblePushNotificationsBestEffort(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    if (!reg.getNotifications) return
    const notes = await reg.getNotifications()
    for (const n of notes) {
      try {
        n.close()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * User opened the app / relevant screen — clear icon badge AND dismiss tray notifications.
 * Push currently only cleared the badge on notificationclick, so opening via icon left a stale badge.
 */
export async function acknowledgePushAlertsBestEffort(): Promise<void> {
  await Promise.all([clearAppBadgeBestEffort(), dismissVisiblePushNotificationsBestEffort()])
}
