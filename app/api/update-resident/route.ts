import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { updateResidentBodySchema } from '@/lib/api-body-schemas'
import { sanitizeString } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'
import { formatZodError } from '@/lib/format-zod-error'
import { normalizePhone } from '@/lib/residents-whatsapp'

type ResidentPhoneFields = {
  phone: string | null
  normalized_phone: string | null
}

function buildResidentPhoneFields(
  raw: string | null | undefined
): { ok: true; data: ResidentPhoneFields } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, data: { phone: null, normalized_phone: null } }
  }

  const normalizedDigits = normalizePhone(raw)
  if (normalizedDigits && normalizedDigits.length < 10) {
    return { ok: false, error: 'מספר טלפון לא תקין' }
  }
  if (!normalizedDigits) {
    return { ok: true, data: { phone: null, normalized_phone: null } }
  }

  return {
    ok: true,
    data: {
      phone: `+${normalizedDigits}`,
      normalized_phone: normalizedDigits,
    },
  }
}

async function findResidentPhoneConflict(
  admin: SupabaseClient,
  clientId: string,
  projectId: string,
  phoneFields: ResidentPhoneFields,
  excludeResidentId: string
): Promise<string | null> {
  if (!phoneFields.normalized_phone) return null

  const { data: sameProject, error: projectErr } = await admin
    .from('residents')
    .select('id')
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .eq('normalized_phone', phoneFields.normalized_phone)
    .is('deleted_at', null)
    .neq('id', excludeResidentId)
    .maybeSingle()

  if (projectErr) return 'שגיאת שרת'
  if (sameProject) return 'דייר עם מספר טלפון זה כבר קיים בבניין הזה'

  if (phoneFields.phone) {
    const { data: sameClient, error: clientErr } = await admin
      .from('residents')
      .select('id')
      .eq('client_id', clientId)
      .eq('phone', phoneFields.phone)
      .is('deleted_at', null)
      .neq('id', excludeResidentId)
      .maybeSingle()

    if (clientErr) return 'שגיאת שרת'
    if (sameClient) return 'מספר טלפון זה כבר משויך לדייר אחר'
  }

  return null
}

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `update-resident-${Date.now()}`

  try {
    const auth = await requireSessionMinRole('manager')
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
      return NextResponse.json({ error: formatZodError(validated.error), requestId }, { status: 400 })
    }

    const { resident_id, soft_delete, project_id, ...fields } = validated.data

    const { data: existing, error: fetchErr } = await admin
      .from('residents')
      .select('id, full_name, project_id, phone, normalized_phone')
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

    const targetProjectId = project_id ?? existing.project_id

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

    let phoneFields: ResidentPhoneFields | undefined
    if (fields.phone !== undefined) {
      const built = buildResidentPhoneFields(fields.phone)
      if (!built.ok) {
        return NextResponse.json({ error: built.error, requestId }, { status: 400 })
      }
      phoneFields = built.data
    }

    const effectivePhoneFields: ResidentPhoneFields = phoneFields ?? {
      phone: existing.phone,
      normalized_phone: existing.normalized_phone,
    }

    const projectChanged = project_id !== undefined && project_id !== existing.project_id
    const phoneChanged =
      phoneFields !== undefined &&
      (phoneFields.phone !== existing.phone ||
        phoneFields.normalized_phone !== existing.normalized_phone)

    if (effectivePhoneFields.normalized_phone && (phoneChanged || projectChanged)) {
      const conflict = await findResidentPhoneConflict(
        admin,
        clientId,
        targetProjectId,
        effectivePhoneFields,
        resident_id
      )
      if (conflict) {
        return NextResponse.json({ error: conflict, requestId }, { status: 400 })
      }
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (project_id !== undefined) payload.project_id = project_id
    if (fields.full_name !== undefined) payload.full_name = sanitizeString(fields.full_name)
    if (phoneFields !== undefined) {
      payload.phone = phoneFields.phone
      payload.normalized_phone = phoneFields.normalized_phone
    }
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
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'מספר טלפון זה כבר משויך לדייר אחר', requestId },
          { status: 400 }
        )
      }
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
