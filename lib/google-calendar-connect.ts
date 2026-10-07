import { createClient } from '@/utils/supabase/client'
import { getClientPublicOrigin } from '@/lib/public-origin'
import { googleOAuthRedirect, isBinoIosShell, postOAuthURLToNativeShell } from '@/lib/native-shell'

const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

/** Start Google OAuth with Calendar Events scope; returns to /calendar?gcal=1. */
export async function startGoogleCalendarConnect(): Promise<void> {
  const supabase = createClient()
  const shell = isBinoIosShell()
  const { redirectTo, skipBrowserRedirect } = googleOAuthRedirect(
    '/calendar?gcal=1',
    getClientPublicOrigin(),
    shell,
  )
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect,
      scopes: ['openid', 'email', 'profile', GOOGLE_CALENDAR_EVENTS_SCOPE].join(' '),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      },
    },
  })
  if (error) throw error
  if (skipBrowserRedirect && !postOAuthURLToNativeShell(data?.url ?? '')) {
    throw new Error('לא הצלחנו לפתוח את החיבור ליומן Google')
  }
}
