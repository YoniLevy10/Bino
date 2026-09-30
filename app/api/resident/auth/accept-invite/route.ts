import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { acceptResidentPortalInvite } from '@/lib/resident-portal/invites'
import {
  RESIDENT_MEMBERSHIP_COOKIE,
  RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
} from '@/lib/resident-portal/types'

export async function POST(req: Request) {
  let body: { token?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) {
    return NextResponse.json({ error: 'חסר אסימון הזמנה' }, { status: 400 })
  }

  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  try {
    const { membershipId } = await acceptResidentPortalInvite(admin, {
      token,
      userId: user.id,
      userEmail: user.email ?? null,
    })

    const res = NextResponse.json({ ok: true, membershipId })
    res.cookies.set(RESIDENT_MEMBERSHIP_COOKIE, membershipId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
    })
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'קבלת הזמנה נכשלה'
    console.error('[resident/auth/accept-invite]', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
