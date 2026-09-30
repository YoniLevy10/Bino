import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeInviteEmail } from '@/lib/resident-portal/crypto'
import { getClientPublicOrigin } from '@/lib/public-origin'

/**
 * Request Supabase email OTP / magic link for resident portal.
 * Does not reveal whether the email has a membership (anti-enumeration).
 */
export async function POST(req: Request) {
  let body: { email?: unknown; inviteToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const email = normalizeInviteEmail(String(body.email || ''))
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'כתובת דוא״ל לא תקינה' }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  const ip =
    (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const limit = await checkIpPostRouteLimit(admin, ip, 'resident-otp')
  if (limit.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד דקה' }, { status: 429 })
  }

  const siteBase = getClientPublicOrigin()
  const inviteToken =
    typeof body.inviteToken === 'string' && body.inviteToken.trim()
      ? body.inviteToken.trim()
      : ''
  const nextPath = inviteToken
    ? `/resident/accept-invite?token=${encodeURIComponent(inviteToken)}`
    : '/resident'

  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteBase}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        shouldCreateUser: true,
      },
    })
    if (error) {
      console.error('[resident/auth/request-otp]', error.message)
      return NextResponse.json(
        { error: 'שליחת קוד ההתחברות נכשלה. בדקו את כתובת הדוא״ל ונסו שוב.' },
        { status: 502 }
      )
    }
  } catch (e) {
    console.error('[resident/auth/request-otp]', e)
    return NextResponse.json({ error: 'שגיאת שרת בשליחת קוד' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message: 'אם הכתובת תקינה, נשלח אליה קישור התחברות.',
  })
}
