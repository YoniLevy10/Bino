import type { CookieOptionsWithName } from '@supabase/ssr'

/**
 * Persistent auth cookies for iOS standalone PWA / Safari.
 * Matches @supabase/ssr DEFAULT_COOKIE_OPTIONS (400-day browser cap).
 * Explicit so every createBrowserClient / createServerClient stays aligned.
 */
export const SUPABASE_AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  maxAge: 400 * 24 * 60 * 60,
}
