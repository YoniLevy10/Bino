import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeString } from '@/lib/api-validation'
import { createResidentBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { normalizePhone } from '@/lib/residents-whatsapp'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `create-resident-${Date.now()}`
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const supabase = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'create-resident')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const validated = createResidentBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten(), requestId }, { status: 400 })
    }

    const body = validated.data
    const fullName = sanitizeString(body.full_name)
    if (!fullName) {
      return NextResponse.json({ error: 'שם מלא נדרש', requestId }, { status: 400 })
    }

    const { data: projectCheck, error: projErr } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .eq('client_id', clientId)
      .is('is_active', true)
      .maybeSingle()

    if (projErr || !projectCheck) {
      return NextResponse.json({ error: 'בניין לא תקף', requestId }, { status: 403 })
    }

    const normalizedDigits = body.phone ? normalizePhone(body.phone) : ''
    if (normalizedDigits && normalizedDigits.length < 10) {
      return NextResponse.json({ error: 'מספר טלפון לא תקין', requestId }, { status: 400 })
    }

    if (normalizedDigits) {
      const { data: existing, error: existingErr } = await supabase
        .from('residents')
        .select('id')
        .eq('client_id', clientId)
        .eq('project_id', body.project_id)
        .eq('normalized_phone', normalizedDigits)
        .is('deleted_at', null)
        .maybeSingle()

      if (existingErr) {
        logger.error('RESIDENTS_API', 'Duplicate resident lookup failed', new Error(existingErr.message), { requestId, clientId })
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }

      if (existing) {
        return NextResponse.json({ error: 'דייר עם מספר טלפון זה כבר קיים בבניין הזה', requestId }, { status: 400 })
      }
    }

    const { data: created, error: insErr } = await supabase
      .from('residents')
      .insert({
        project_id: body.project_id,
        client_id: clientId,
        full_name: fullName,
        phone: normalizedDigits ? `+${normalizedDigits}` : null,
        normalized_phone: normalizedDigits || null,
        apartment_number: sanitizeString(body.apartment_number) || null,
        notes: sanitizeString(body.notes) || null,
      })
      .select('id, project_id, client_id, full_name, phone, normalized_phone, apartment_number, notes')
      .single()

    if (insErr) {
      logger.error('RESIDENTS_API', 'Create resident failed', new Error(insErr.message), { requestId, clientId })
      audit.logFailedOperation('CREATE', 'RESIDENT', 'unknown', clientId, insErr.message)
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    audit.logAction('CREATE', 'RESIDENT', (created as { id?: string } | null)?.id || 'unknown', clientId, 'dashboard')
    return NextResponse.json({ resident: created, requestId })
  } catch (e) {
    console.error('[create-resident]', e)
    logger.error('RESIDENTS_API', 'Unhandled create-resident error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
  }
}
