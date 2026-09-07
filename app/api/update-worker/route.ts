import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { updateWorkerBodySchema } from '@/lib/api-body-schemas'
import { sanitizeString } from '@/lib/api-validation'
import { normalizeWorkerPhone, parseWorkerPhone, sanitizeExtraPhones } from '@/lib/worker-phones'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `update-worker-${Date.now()}`

  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'update-worker')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => null)
    const validated = updateWorkerBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { worker_id, soft_delete, ...fields } = validated.data

    const { data: existing, error: fetchErr } = await admin
      .from('workers')
      .select('id, full_name, phone, email, is_active')
      .eq('id', worker_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'עובד לא נמצא', requestId }, { status: 404 })
    }

    if (soft_delete) {
      const { error } = await admin
        .from('workers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', worker_id)
        .eq('client_id', clientId)
      if (error) {
        return NextResponse.json({ error: 'מחיקה נכשלה', requestId }, { status: 500 })
      }
      await logAudit({
        clientId,
        userId: auth.ctx.userId,
        action: 'DELETE_WORKER',
        entityType: 'worker',
        entityId: worker_id,
        oldValues: { full_name: existing.full_name },
      })
      return NextResponse.json({ success: true, requestId })
    }

    // workers has no updated_at column (unlike tickets/residents) — do not set it
    const payload: Record<string, unknown> = {}
    if (fields.full_name !== undefined) payload.full_name = sanitizeString(fields.full_name)
    let normalizedPrimary: string | undefined
    if (fields.phone !== undefined) {
      const phoneParsed = parseWorkerPhone(fields.phone, 'מספר טלפון ראשי')
      if (!phoneParsed.ok) {
        return NextResponse.json({ error: phoneParsed.error, requestId }, { status: 400 })
      }
      normalizedPrimary = phoneParsed.normalized
      payload.phone = normalizedPrimary
    }
    if (fields.extra_phones !== undefined) {
      const phoneForExtra =
        normalizedPrimary ??
        (fields.phone !== undefined
          ? ''
          : normalizeWorkerPhone(existing.phone || '') || existing.phone || '')
      const extraSanitized = sanitizeExtraPhones(phoneForExtra, fields.extra_phones)
      if (!extraSanitized.ok) {
        return NextResponse.json({ error: extraSanitized.error, requestId }, { status: 400 })
      }
      payload.extra_phones = extraSanitized.phones
    }
    if (fields.email !== undefined) {
      payload.email = fields.email === '' || fields.email === null ? null : sanitizeString(fields.email)
    }
    if (fields.role !== undefined) payload.role = fields.role
    if (fields.is_active !== undefined) payload.is_active = fields.is_active
    if (fields.hourly_rate !== undefined) payload.hourly_rate = fields.hourly_rate

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'נדרש לפחות שדה אחד לעדכון', requestId }, { status: 400 })
    }

    const { data: updated, error } = await admin
      .from('workers')
      .update(payload)
      .eq('id', worker_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .select('id, full_name, phone, email, role, is_active, extra_phones, hourly_rate')
      .single()

    if (error) {
      logger.error('WORKER_API', 'Update worker failed', new Error(error.message), { requestId, worker_id })
      return NextResponse.json({ error: 'עדכון נכשל', details: error.message, requestId }, { status: 500 })
    }

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'UPDATE_WORKER',
      entityType: 'worker',
      entityId: worker_id,
      newValues: payload,
    })

    return NextResponse.json({ success: true, data: updated, requestId })
  } catch (e) {
    logger.error('WORKER_API', 'update-worker error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
