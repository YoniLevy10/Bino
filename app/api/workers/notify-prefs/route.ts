import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { workerNotifyPrefsBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'

/** Update per-worker notification / escort capability prefs. */
export async function PATCH(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'worker-notify-prefs')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = workerNotifyPrefsBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { worker_id, ...prefs } = parsed.data
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (prefs.notify_sms !== undefined) patch.notify_sms = prefs.notify_sms
  if (prefs.notify_whatsapp !== undefined) patch.notify_whatsapp = prefs.notify_whatsapp
  if (prefs.notify_push !== undefined) patch.notify_push = prefs.notify_push
  if (prefs.can_mark_professional_escort !== undefined) {
    patch.can_mark_professional_escort = prefs.can_mark_professional_escort
  }

  const { data, error } = await admin
    .from('workers')
    .update(patch)
    .eq('id', worker_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .select(
      'id, notify_sms, notify_whatsapp, notify_push, can_mark_professional_escort'
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 })
  }

  return NextResponse.json({ worker: data })
}
