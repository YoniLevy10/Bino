import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMembershipForUser } from '@/lib/resident-portal/memberships'
import {
  RESIDENT_MEMBERSHIP_COOKIE,
  RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
} from '@/lib/resident-portal/types'

/** Select active membership context (httpOnly cookie). */
export async function POST(req: Request) {
  let body: { membershipId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const membershipId =
    typeof body.membershipId === 'string' ? body.membershipId.trim() : ''
  if (!membershipId) {
    return NextResponse.json({ error: 'חסר מזהה חברות' }, { status: 400 })
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

  const membership = await getMembershipForUser(admin, user.id, membershipId)
  if (!membership) {
    return NextResponse.json(
      { error: 'החברות אינה פעילה או שאינה שייכת למשתמש', code: 'MEMBERSHIP_DENIED' },
      { status: 403 }
    )
  }

  const res = NextResponse.json({
    ok: true,
    membership: {
      id: membership.id,
      project_name: membership.project_name,
      apartment_number: membership.apartment_number,
      client_name: membership.client_name,
    },
  })
  res.cookies.set(RESIDENT_MEMBERSHIP_COOKIE, membership.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(RESIDENT_MEMBERSHIP_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
