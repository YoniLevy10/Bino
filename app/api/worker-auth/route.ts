import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { z } from 'zod'

/** Field worker deep link: validate access_token without Google session. */
export async function GET(req: NextRequest) {
  try {
    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    if (!token) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('workers')
      .select('id, client_id, full_name, is_active')
      .eq('access_token', token)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !data || !data.is_active) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    return NextResponse.json({
      worker_id: data.id,
      client_id: data.client_id,
      full_name: data.full_name,
    })
  } catch {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  }
}

const emailLoginSchema = z.object({ email: z.string().email() })

/** Email login: look up worker by email and return their access token for deep-link auth. */
export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-auth')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 }) }

    const parsed = emailLoginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'אימייל לא תקין' }, { status: 400 })
    }
    const email = parsed.data.email.toLowerCase().trim()

    const { data, error } = await admin
      .from('workers')
      .select('id, client_id, full_name, access_token, is_active')
      .ilike('email', email)
      .is('deleted_at', null)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (error || !data || !data.access_token) {
      return NextResponse.json({ error: 'לא נמצא עובד עם אימייל זה' }, { status: 404 })
    }

    return NextResponse.json({
      worker_id: data.id,
      client_id: data.client_id,
      full_name: data.full_name,
      token: data.access_token,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאה פנימית' }, { status: 500 })
  }
}
