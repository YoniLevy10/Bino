import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { requestResidentPhoneOtp } from '@/lib/resident-portal/phone-otp'
import { sanitizeId } from '@/lib/api-validation'

/**
 * Shared join-link step 1.
 * Always returns a generic success message when the phone is unknown (anti-enumeration),
 * except rate limits / invalid input / SMS provider failure.
 */
export async function POST(req: Request) {
  let body: { project_id?: unknown; phone?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const projectId = sanitizeId(body.project_id)
  const phone = typeof body.phone === 'string' ? body.phone : ''
  if (!projectId || !phone.trim()) {
    return NextResponse.json({ error: 'חסרים פרויקט או טלפון' }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  const ip =
    (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const limit = await checkIpPostRouteLimit(admin, ip, 'resident-phone-otp')
  if (limit.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד דקה' }, { status: 429 })
  }

  const result = await requestResidentPhoneOtp(admin, { projectId, phoneRaw: phone })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Same client-facing message whether listed or not (except portal_disabled / ambiguous).
  if (!result.sent) {
    if (result.reason === 'portal_disabled') {
      return NextResponse.json({ error: 'פורטל הדיירים אינו פעיל בבניין זה' }, { status: 403 })
    }
    if (result.reason === 'ambiguous') {
      return NextResponse.json(
        { error: 'המספר משויך ליותר מדירה אחת — פנו לחברת הניהול' },
        { status: 409 }
      )
    }
  }

  return NextResponse.json({
    ok: true,
    message: 'אם המספר רשום בפרויקט, נשלח אליו קוד ב-SMS.',
  })
}
