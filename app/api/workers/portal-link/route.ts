import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { sendWorkerPortalLinkBodySchema } from '@/lib/api-body-schemas'
import { getWorkerPortalUrl } from '@/lib/public-app-url'

/** Returns a one-off portal URL for clipboard; token is never listed in browser SELECTs. */
export async function POST(req: Request) {
  try {
    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'workers-portal-link')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const rawBody = await req.json()
    const validated = sendWorkerPortalLinkBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { worker_id } = validated.data

    const { data: worker, error: workerError } = await admin
      .from('workers')
      .select('id, access_token, is_active')
      .eq('id', worker_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (workerError || !worker) {
      return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 })
    }

    if (!worker.is_active) {
      return NextResponse.json({ error: 'העובד אינו פעיל' }, { status: 400 })
    }

    const token = worker.access_token?.trim()
    if (!token) {
      return NextResponse.json({ error: 'אין קישור אישי לעובד — פנו לתמיכה' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, url: getWorkerPortalUrl(token) })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
