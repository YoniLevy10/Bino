import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeString } from '@/lib/api-validation'
import { createProfessionalBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionMinRole } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { parseWorkerPhone, sanitizeExtraPhones } from '@/lib/worker-phones'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `create-professional-${Date.now()}`
  try {
    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = createProfessionalBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }
    const body = parsed.data

    const supabase = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'create-professional')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const clientId = auth.ctx.clientId

    const addonCheck = await requireClientPaidAddon(supabase, clientId, PAID_ADDON_KEYS.professionals)
    if (!addonCheck.ok) return addonCheck.response

    const fullName = sanitizeString(body.full_name)
    if (!fullName) {
      return NextResponse.json({ error: 'שם מלא נדרש', requestId }, { status: 400 })
    }

    const phoneParsed = parseWorkerPhone(body.phone, 'מספר טלפון ראשי')
    if (!phoneParsed.ok) {
      return NextResponse.json({ error: phoneParsed.error, requestId }, { status: 400 })
    }

    const extraSanitized = sanitizeExtraPhones(phoneParsed.normalized, body.extra_phones ?? [])
    if (!extraSanitized.ok) {
      return NextResponse.json({ error: extraSanitized.error, requestId }, { status: 400 })
    }

    const emailRaw = body.email != null ? String(body.email).trim() : ''
    const email = emailRaw && emailRaw !== '' ? emailRaw : null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'אימייל לא תקין', requestId }, { status: 400 })
    }

    const { data: created, error: insErr } = await supabase
      .from('professionals')
      .insert({
        client_id: clientId,
        full_name: fullName,
        phone: phoneParsed.normalized,
        extra_phones: extraSanitized.phones,
        trade: body.trade ? sanitizeString(String(body.trade)) : null,
        company_name: body.company_name ? sanitizeString(String(body.company_name)) : null,
        email,
        notes: body.notes ? sanitizeString(String(body.notes)) : null,
        is_active: body.is_active !== false,
      })
      .select()
      .single()

    if (insErr) {
      logger.error('PROFESSIONAL_API', 'Create failed', new Error(insErr.message), { requestId, clientId })
      audit.logFailedOperation('CREATE', 'PROFESSIONAL', 'unknown', clientId, insErr.message)
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    audit.logAction('CREATE', 'PROFESSIONAL', (created as { id?: string } | null)?.id || 'unknown', clientId, 'dashboard')
    return NextResponse.json({ professional: created, requestId })
  } catch (e) {
    logger.error('PROFESSIONAL_API', 'Unhandled create-professional', e instanceof Error ? e : new Error(String(e)), {
      requestId,
    })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
