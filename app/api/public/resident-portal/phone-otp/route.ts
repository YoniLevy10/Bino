import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  requestResidentPhoneOtp,
  residentPhoneOtpHttpResult,
} from '@/lib/resident-portal/phone-otp'
import { sanitizeId } from '@/lib/api-validation'

/**
 * Building-link login step 1.
 * An unregistered phone gets an error. SMS is sent only when the number is on that building's list.
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
  const http = residentPhoneOtpHttpResult(result)
  return NextResponse.json(http.body, { status: http.status })
}
