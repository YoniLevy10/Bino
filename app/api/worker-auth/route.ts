import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { z } from 'zod'

function getRequestIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

/** Field worker deep link: validate access_token without Google session. */
export async function GET(req: NextRequest) {
  try {
    const ip = getRequestIp(req)
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-auth-token')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    if (!token) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('workers')
      .select('id, full_name, is_active')
      .eq('access_token', token)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !data || !data.is_active) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    return NextResponse.json({
      worker_id: data.id,
      full_name: data.full_name,
    })
  } catch {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  }
}

const emailLoginSchema = z.object({ email: z.string().email() })

/**
 * Disabled by default: returning a worker access token by email alone is unsafe.
 * Keep this endpoint as a controlled placeholder so old UI calls fail safely
 * instead of leaking tokens. Future safe flow should use magic link/OTP.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIp(req)
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-auth-email')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 }) }

    const parsed = emailLoginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'אימייל לא תקין' }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'כניסת עובד דרך אימייל בלבד אינה פעילה מטעמי אבטחה. יש להשתמש בקישור עובד אישי.' },
      { status: 403 }
    )
  } catch {
    return NextResponse.json({ error: 'שגיאה פנימית' }, { status: 500 })
  }
}
