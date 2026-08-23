import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { upsertGoogleCalendarConnection } from '@/lib/google-calendar'
import { z } from 'zod'

const bodySchema = z.object({
  refresh_token: z.string().min(10),
  access_token: z.string().min(10).nullable().optional(),
  expires_in: z.number().int().positive().nullable().optional(),
  google_email: z.string().email().nullable().optional(),
})

/**
 * Persist Google Calendar OAuth tokens after consent on /calendar.
 * Called from the client once the session has provider_token / provider_refresh_token.
 */
export async function POST(req: Request) {
  const requestId = `gcal-save-${Date.now()}`
  try {
    const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.calendar)
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'calendar-google-save')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות', requestId }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const result = await upsertGoogleCalendarConnection(admin, {
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      googleEmail: parsed.data.google_email ?? null,
      refreshToken: parsed.data.refresh_token,
      accessToken: parsed.data.access_token ?? null,
      expiresInSeconds: parsed.data.expires_in ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: 'שמירת החיבור נכשלה', requestId }, { status: 500 })
    }

    return NextResponse.json({ ok: true, requestId })
  } catch (e) {
    console.error('[calendar/google/save POST]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
