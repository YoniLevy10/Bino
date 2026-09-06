/**
 * Google Calendar API helpers — push Bino office events to the tenant's Google Calendar.
 * Uses stored OAuth refresh tokens (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

export const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export type GoogleCalendarConnectionRow = {
  client_id: string
  user_id: string
  google_email: string | null
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
  calendar_id: string
}

export type BamakorCalendarEventForSync = {
  id: string
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  google_event_id?: string | null
}

function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
}

export function isGoogleCalendarSyncConfigured(): boolean {
  return googleOAuthConfigured()
}

function toGoogleDateTime(iso: string, allDay: boolean): Record<string, string> {
  if (allDay) {
    const d = new Date(iso)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return { date: `${y}-${m}-${day}` }
  }
  return { dateTime: new Date(iso).toISOString(), timeZone: 'Asia/Jerusalem' }
}

function eventBody(ev: BamakorCalendarEventForSync) {
  return {
    summary: ev.title,
    description: ev.description || undefined,
    location: ev.location || undefined,
    start: toGoogleDateTime(ev.starts_at, ev.all_day),
    end: toGoogleDateTime(ev.ends_at, ev.all_day),
    extendedProperties: {
      private: { bamakor_event_id: ev.id },
    },
  }
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res || !res.ok) {
    const text = res ? await res.text().catch(() => '') : ''
    console.error('[google-calendar] token refresh failed', res?.status, text.slice(0, 200))
    return null
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) return null
  return { access_token: json.access_token, expires_in: json.expires_in ?? 3600 }
}

async function getValidAccessToken(
  admin: SupabaseClient,
  conn: GoogleCalendarConnectionRow
): Promise<string | null> {
  const expiresAt = conn.access_token_expires_at
    ? new Date(conn.access_token_expires_at).getTime()
    : 0
  const stillValid =
    conn.access_token && expiresAt > Date.now() + 60_000 /* 1 min skew */

  if (stillValid && conn.access_token) return conn.access_token

  const refreshed = await refreshAccessToken(conn.refresh_token)
  if (!refreshed) return null

  const expires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  await admin
    .from('google_calendar_connections')
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: expires,
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', conn.client_id)

  return refreshed.access_token
}

export async function loadGoogleCalendarConnection(
  admin: SupabaseClient,
  clientId: string
): Promise<GoogleCalendarConnectionRow | null> {
  const { data, error } = await admin
    .from('google_calendar_connections')
    .select(
      'client_id, user_id, google_email, refresh_token, access_token, access_token_expires_at, calendar_id'
    )
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) {
    console.error('[google-calendar] load connection', error.message)
    return null
  }
  return data as GoogleCalendarConnectionRow | null
}

export async function upsertGoogleCalendarConnection(
  admin: SupabaseClient,
  params: {
    clientId: string
    userId: string
    googleEmail: string | null
    refreshToken: string
    accessToken: string | null
    expiresInSeconds?: number | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const expires =
    params.accessToken && params.expiresInSeconds
      ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
      : null

  const { error } = await admin.from('google_calendar_connections').upsert(
    {
      client_id: params.clientId,
      user_id: params.userId,
      google_email: params.googleEmail,
      refresh_token: params.refreshToken,
      access_token: params.accessToken,
      access_token_expires_at: expires,
      calendar_id: 'primary',
      updated_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  )

  if (error) {
    console.error('[google-calendar] upsert connection', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

async function gcalFetch(
  accessToken: string,
  calendarId: string,
  path: string,
  init: RequestInit
): Promise<Response | null> {
  const cal = encodeURIComponent(calendarId || 'primary')
  const url = `https://www.googleapis.com/calendar/v3/calendars/${cal}${path}`
  return fetchWithTimeout(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

/** Create or update Google event; returns google event id or null on failure (non-fatal). */
export async function syncEventToGoogleCalendar(
  admin: SupabaseClient,
  clientId: string,
  ev: BamakorCalendarEventForSync
): Promise<string | null> {
  if (!isGoogleCalendarSyncConfigured()) return null

  const conn = await loadGoogleCalendarConnection(admin, clientId)
  if (!conn) return null

  const token = await getValidAccessToken(admin, conn)
  if (!token) return null

  const body = JSON.stringify(eventBody(ev))

  if (ev.google_event_id) {
    const res = await gcalFetch(
      token,
      conn.calendar_id,
      `/events/${encodeURIComponent(ev.google_event_id)}`,
      { method: 'PATCH', body }
    )
    if (res?.ok) return ev.google_event_id
    // Stale id — create fresh
    if (res && (res.status === 404 || res.status === 410)) {
      // fall through to create
    } else {
      const text = res ? await res.text().catch(() => '') : ''
      console.error('[google-calendar] patch failed', res?.status, text.slice(0, 200))
      return ev.google_event_id
    }
  }

  const res = await gcalFetch(token, conn.calendar_id, '/events', {
    method: 'POST',
    body,
  })
  if (!res?.ok) {
    const text = res ? await res.text().catch(() => '') : ''
    console.error('[google-calendar] create failed', res?.status, text.slice(0, 200))
    return null
  }
  const json = (await res.json()) as { id?: string }
  return json.id || null
}

export async function deleteGoogleCalendarEvent(
  admin: SupabaseClient,
  clientId: string,
  googleEventId: string | null | undefined
): Promise<void> {
  if (!googleEventId || !isGoogleCalendarSyncConfigured()) return

  const conn = await loadGoogleCalendarConnection(admin, clientId)
  if (!conn) return

  const token = await getValidAccessToken(admin, conn)
  if (!token) return

  const res = await gcalFetch(
    token,
    conn.calendar_id,
    `/events/${encodeURIComponent(googleEventId)}`,
    { method: 'DELETE' }
  )
  // 204/404 = gone — fine
  if (res && !res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => '')
    console.error('[google-calendar] delete failed', res.status, text.slice(0, 200))
  }
}
