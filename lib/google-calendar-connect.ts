import { createClient } from '@/utils/supabase/client'

const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

/** Start Google OAuth with Calendar Events scope; returns to /calendar?gcal=1. */
export async function startGoogleCalendarConnect(): Promise<void> {
  const supabase = createClient()
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/calendar?gcal=1')}`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: ['openid', 'email', 'profile', GOOGLE_CALENDAR_EVENTS_SCOPE].join(' '),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      },
    },
  })
  if (error) throw error
}
