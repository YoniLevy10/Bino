import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimitIpEndpoint, sanitizeString } from '@/lib/api-validation'
import { publicResidentIntakeBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { mergeResidentIntakeFields } from '@/lib/resident-intake'
import { getLogger } from '@/lib/logging'

type ExistingResidentRow = {
  id: string
  project_id: string
  full_name: string | null
  phone: string | null
  normalized_phone: string | null
  email: string | null
  apartment_number: string | null
  is_renter: boolean | null
  deleted_at: string | null
}

const EXISTING_SELECT =
  'id, project_id, full_name, phone, normalized_phone, email, apartment_number, is_renter, deleted_at'

/** Prefer active rows over soft-deleted ones. */
function pickPreferredResidentRow(rows: ExistingResidentRow[]): ExistingResidentRow | null {
  if (!rows.length) return null
  return rows.find((r) => !r.deleted_at) ?? rows[0] ?? null
}

/**
 * Public resident intake — unauthenticated, scoped by client_id + project_code.
 * Upserts into `residents` by phone: same card gets missing details filled in
 * (no overwrite of existing values, no duplicate rows).
 */
export async function POST(req: NextRequest) {
  const logger = getLogger()
  const requestId = `resident-intake-${Date.now()}`
  try {
    const admin = getSupabaseAdmin()
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimitIpEndpoint({
      supabaseAdmin: admin,
      ip,
      endpoint: 'POST /api/public/resident-intake',
      maxRequests: 12,
    })
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות, נסו שוב בעוד דקה', requestId }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const validated = publicResidentIntakeBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: formatZodError(validated.error), requestId }, { status: 400 })
    }

    const body = validated.data
    const clientId = body.client_id
    const projectCode = sanitizeString(body.project_code).toUpperCase()
    const fullName = sanitizeString(body.full_name)
    const apartmentNumber = sanitizeString(body.apartment_number)
    const email = sanitizeString(body.email || '') || null
    const isRenter = body.is_renter ?? false

    if (!fullName || !apartmentNumber) {
      return NextResponse.json({ error: 'שם ומספר דירה נדרשים', requestId }, { status: 400 })
    }

    const normalizedDigits = normalizePhone(body.phone)
    if (!normalizedDigits || normalizedDigits.length < 10) {
      return NextResponse.json({ error: 'מספר טלפון לא תקין', requestId }, { status: 400 })
    }

    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id, name, client_id')
      .eq('client_id', clientId)
      .eq('project_code', projectCode)
      .eq('is_active', true)
      .maybeSingle()

    if (projErr) {
      logger.error('RESIDENT_INTAKE', 'Project lookup failed', new Error(projErr.message), {
        requestId,
        clientId,
      })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }
    if (!project) {
      return NextResponse.json({ error: 'בניין לא נמצא או לא פעיל', requestId }, { status: 404 })
    }

    const phoneE164 = `+${normalizedDigits}`
    const incoming = {
      full_name: fullName,
      phone: phoneE164,
      normalized_phone: normalizedDigits,
      email,
      apartment_number: apartmentNumber,
      is_renter: isRenter,
    }

    const { data: sameBuildingRows, error: sameBuildingErr } = await admin
      .from('residents')
      .select(EXISTING_SELECT)
      .eq('client_id', clientId)
      .eq('project_id', project.id)
      .eq('normalized_phone', normalizedDigits)
      .limit(5)

    if (sameBuildingErr) {
      logger.error('RESIDENT_INTAKE', 'Duplicate lookup failed', new Error(sameBuildingErr.message), {
        requestId,
        clientId,
      })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    let existing =
      pickPreferredResidentRow((sameBuildingRows as ExistingResidentRow[] | null) ?? []) ?? null

    if (!existing) {
      const { data: tenantRows, error: tenantErr } = await admin
        .from('residents')
        .select(EXISTING_SELECT)
        .eq('client_id', clientId)
        .eq('normalized_phone', normalizedDigits)
        .limit(5)

      if (tenantErr) {
        logger.error('RESIDENT_INTAKE', 'Tenant phone lookup failed', new Error(tenantErr.message), {
          requestId,
          clientId,
        })
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }
      existing = pickPreferredResidentRow((tenantRows as ExistingResidentRow[] | null) ?? [])
    }

    // Also match on raw E.164 phone (tenant unique index key) when normalized_phone was never backfilled.
    if (!existing) {
      const { data: byPhoneRows, error: byPhoneErr } = await admin
        .from('residents')
        .select(EXISTING_SELECT)
        .eq('client_id', clientId)
        .eq('phone', phoneE164)
        .limit(5)

      if (byPhoneErr) {
        logger.error('RESIDENT_INTAKE', 'Phone lookup failed', new Error(byPhoneErr.message), {
          requestId,
          clientId,
        })
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }
      existing = pickPreferredResidentRow((byPhoneRows as ExistingResidentRow[] | null) ?? [])
    }

    if (existing?.id) {
      const { patch } = mergeResidentIntakeFields(existing, incoming, project.id)
      const updatePayload: Record<string, unknown> = {
        full_name: patch.full_name,
        phone: patch.phone,
        normalized_phone: patch.normalized_phone,
        email: patch.email,
        apartment_number: patch.apartment_number,
        is_renter: patch.is_renter,
        project_id: patch.project_id,
        updated_at: new Date().toISOString(),
      }
      if (patch.deleted_at === null) {
        updatePayload.deleted_at = null
      }

      const { error: updErr } = await admin
        .from('residents')
        .update(updatePayload)
        .eq('id', existing.id)
        .eq('client_id', clientId)

      if (updErr) {
        logger.error('RESIDENT_INTAKE', 'Update resident failed', new Error(updErr.message), {
          requestId,
          clientId,
        })
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        updated: true,
        resident_id: existing.id,
        requestId,
      })
    }

    const insertPayload = {
      project_id: project.id,
      client_id: clientId,
      full_name: fullName,
      phone: phoneE164,
      normalized_phone: normalizedDigits,
      email,
      is_renter: isRenter,
      apartment_number: apartmentNumber,
    }

    const { data: created, error: insErr } = await admin
      .from('residents')
      .insert(insertPayload)
      .select('id')
      .single()

    if (insErr) {
      // Race / unique index: merge into the existing card instead of failing as a duplicate.
      if (
        insErr.code === '23505' ||
        insErr.message?.includes('idx_residents_client_phone_unique') ||
        insErr.message?.includes('idx_residents_project_normalized_phone_unique')
      ) {
        const { data: racedRows } = await admin
          .from('residents')
          .select(EXISTING_SELECT)
          .eq('client_id', clientId)
          .or(`normalized_phone.eq.${normalizedDigits},phone.eq.${phoneE164}`)
          .limit(5)

        const raced = pickPreferredResidentRow((racedRows as ExistingResidentRow[] | null) ?? [])
        if (raced?.id) {
          const { patch } = mergeResidentIntakeFields(raced, incoming, project.id)
          const updatePayload: Record<string, unknown> = {
            full_name: patch.full_name,
            phone: patch.phone,
            normalized_phone: patch.normalized_phone,
            email: patch.email,
            apartment_number: patch.apartment_number,
            is_renter: patch.is_renter,
            project_id: patch.project_id,
            updated_at: new Date().toISOString(),
          }
          if (patch.deleted_at === null) updatePayload.deleted_at = null

          const { error: raceUpdErr } = await admin
            .from('residents')
            .update(updatePayload)
            .eq('id', raced.id)
            .eq('client_id', clientId)

          if (!raceUpdErr) {
            return NextResponse.json({
              ok: true,
              updated: true,
              resident_id: raced.id,
              requestId,
            })
          }
        }
      }

      logger.error('RESIDENT_INTAKE', 'Insert resident failed', new Error(insErr.message), {
        requestId,
        clientId,
      })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      updated: false,
      resident_id: (created as { id: string }).id,
      requestId,
    })
  } catch (e) {
    console.error('[resident-intake]', e)
    return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
  }
}
