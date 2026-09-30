import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { verifyResidentPhoneOtp } from '@/lib/resident-portal/phone-otp'
import { sanitizeId } from '@/lib/api-validation'
import {
  RESIDENT_MEMBERSHIP_COOKIE,
  RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
} from '@/lib/resident-portal/types'

/** Shared join-link step 2: verify SMS code → return session material for the browser. */
export async function POST(req: Request) {
  let body: { project_id?: unknown; phone?: unknown; code?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const projectId = sanitizeId(body.project_id)
  const phone = typeof body.phone === 'string' ? body.phone : ''
  const code = typeof body.code === 'string' ? body.code : ''
  if (!projectId || !phone.trim() || !code.trim()) {
    return NextResponse.json({ error: 'חסרים שדות' }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  const ip =
    (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const limit = await checkIpPostRouteLimit(admin, ip, 'resident-phone-verify')
  if (limit.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד דקה' }, { status: 429 })
  }

  const result = await verifyResidentPhoneOtp(admin, {
    projectId,
    phoneRaw: phone,
    code,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const res = NextResponse.json({
    ok: true,
    email: result.email,
    token_hash: result.tokenHash,
    membershipId: result.membershipId,
  })
  res.cookies.set(RESIDENT_MEMBERSHIP_COOKIE, result.membershipId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
  })
  return res
}
