/** Register /sw.js and wait until PushManager can use it. */
export async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('הדפדפן לא תומך בשירות רקע — הוסיפו את האפליקציה למסך הבית')
  }

  let registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  }

  const worker = registration.installing || registration.waiting || registration.active
  if (worker && worker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('הפעלת האפליקציה ארכה זמן מדי — נסו שוב')), 15_000)
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          window.clearTimeout(timeout)
          resolve()
        }
      })
    })
  }

  await navigator.serviceWorker.ready
  return registration
}

export function isStandaloneWorkerPwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
