import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { updateResidentBodySchema } from '@/lib/api-body-schemas'
import { sanitizeString } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `update-resident-${Date.now()}`

  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'update-resident')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => null)
    const validated = updateResidentBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { resident_id, soft_delete, project_id, ...fields } = validated.data

    const { data: existing, error: fetchErr } = await admin
      .from('residents')
      .select('id, full_name, project_id')
      .eq('id', resident_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'דייר לא נמצא', requestId }, { status: 404 })
    }

    if (soft_delete) {
      const { error } = await admin
        .from('residents')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', resident_id)
        .eq('client_id', clientId)
      if (error) {
        return NextResponse.json({ error: 'מחיקה נכשלה', requestId }, { status: 500 })
      }
      await logAudit({
        clientId,
        userId: auth.ctx.userId,
        action: 'DELETE_RESIDENT',
        entityType: 'resident',
        entityId: resident_id,
      })
      return NextResponse.json({ success: true, requestId })
    }

    if (project_id) {
      const { data: project } = await admin
        .from('projects')
        .select('id')
        .eq('id', project_id)
        .eq('client_id', clientId)
        .maybeSingle()
      if (!project) {
        return NextResponse.json({ error: 'פרויקט לא תקף', requestId }, { status: 400 })
      }
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (project_id !== undefined) payload.project_id = project_id
    if (fields.full_name !== undefined) payload.full_name = sanitizeString(fields.full_name)
    if (fields.phone !== undefined) payload.phone = fields.phone
    if (fields.email !== undefined) {
      payload.email = fields.email === '' || fields.email === null ? null : fields.email
    }
    if (fields.is_renter !== undefined) payload.is_renter = fields.is_renter
    if (fields.apartment_number !== undefined) payload.apartment_number = fields.apartment_number
    if (fields.notes !== undefined) payload.notes = fields.notes

    const { data: updated, error } = await admin
      .from('residents')
      .update(payload)
      .eq('id', resident_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .select('id, project_id, client_id, full_name, phone, email, is_renter, apartment_number, notes')
      .single()

    if (error) {
      logger.error('RESIDENT_API', 'Update resident failed', new Error(error.message), { requestId, resident_id })
      return NextResponse.json({ error: 'עדכון נכשל', requestId }, { status: 500 })
    }

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'UPDATE_RESIDENT',
      entityType: 'resident',
      entityId: resident_id,
      newValues: payload,
    })

    return NextResponse.json({ success: true, data: updated, requestId })
  } catch (e) {
    logger.error('RESIDENT_API', 'update-resident error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
