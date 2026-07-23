import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimitIpEndpoint, sanitizeString } from '@/lib/api-validation'
import { publicResidentIntakeBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { getLogger } from '@/lib/logging'

/**
 * Public resident intake — unauthenticated, scoped by client_id + project_code.
 * Upserts into `residents` by (client_id, project_id, normalized_phone).
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
    const payload = {
      project_id: project.id,
      client_id: clientId,
      full_name: fullName,
      phone: phoneE164,
      normalized_phone: normalizedDigits,
      email,
      is_renter: isRenter,
      apartment_number: apartmentNumber,
    }

    const { data: existing, error: existingErr } = await admin
      .from('residents')
      .select('id')
      .eq('client_id', clientId)
      .eq('project_id', project.id)
      .eq('normalized_phone', normalizedDigits)
      .is('deleted_at', null)
      .maybeSingle()

    if (existingErr) {
      logger.error('RESIDENT_INTAKE', 'Duplicate lookup failed', new Error(existingErr.message), {
        requestId,
        clientId,
      })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    if (existing?.id) {
      const { error: updErr } = await admin
        .from('residents')
        .update({
          full_name: payload.full_name,
          phone: payload.phone,
          email: payload.email,
          is_renter: payload.is_renter,
          apartment_number: payload.apartment_number,
        })
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

    const { data: created, error: insErr } = await admin
      .from('residents')
      .insert(payload)
      .select('id')
      .single()

    if (insErr) {
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
