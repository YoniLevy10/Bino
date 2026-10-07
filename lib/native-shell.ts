/**
 * iOS App Store shell (WKWebView) talks to the site through a user-agent token
 * and a `bino` WebKit message handler. Browser and installed PWA sessions never
 * hit this path.
 *
 * Google blocks OAuth inside WKWebView, so the shell opens the provider in
 * ASWebAuthenticationSession and returns via `bino://auth/callback`.
 * Add that URL in Supabase → Authentication → Redirect URLs.
 */

const NATIVE_UA_TOKEN = 'BinoIOS'
const OAUTH_MESSAGE = 'oauth'

type NativeBridge = {
  postMessage: (message: unknown) => void
}

type WebkitWindow = Window & {
  webkit?: { messageHandlers?: { bino?: NativeBridge } }
}

export function isBinoIosShell(): boolean {
  if (typeof window === 'undefined') return false
  if (nativeBridge()) return true
  return navigator.userAgent.includes(NATIVE_UA_TOKEN)
}

export function googleOAuthRedirect(
  nextPath: string,
  webOrigin: string,
  inNativeShell: boolean,
): { redirectTo: string; skipBrowserRedirect: boolean } {
  const next = sanitizeAppPath(nextPath)
  if (inNativeShell) {
    return {
      redirectTo: `bino://auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    }
  }
  const origin = webOrigin.replace(/\/$/, '')
  return {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    skipBrowserRedirect: false,
  }
}

/** Hands the Supabase authorize URL to the native shell. Returns false if this page is not the shell. */
export function postOAuthURLToNativeShell(url: string): boolean {
  const native = nativeBridge()
  if (!native || !isAllowedOAuthURL(url)) return false
  native.postMessage({ type: OAUTH_MESSAGE, url })
  return true
}

export function isAllowedOAuthURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    return host === 'accounts.google.com' || host === 'supabase.co' || host.endsWith('.supabase.co')
  } catch {
    return false
  }
}

function sanitizeAppPath(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

function nativeBridge(): NativeBridge | null {
  if (typeof window === 'undefined') return null
  return (window as WebkitWindow).webkit?.messageHandlers?.bino ?? null
}
