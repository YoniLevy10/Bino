import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeString } from '@/lib/api-validation'
import { updateProfessionalBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId } from '@/lib/api-auth'
import { normalizeWorkerPhone, parseWorkerPhone, sanitizeExtraPhones } from '@/lib/worker-phones'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'

export async function PATCH(req: Request) {
  const requestId = `update-professional-${Date.now()}`
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = updateProfessionalBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const { professional_id, ...body } = parsed.data
    const supabase = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const addonCheck = await requireClientPaidAddon(supabase, clientId, PAID_ADDON_KEYS.professionals)
    if (!addonCheck.ok) return addonCheck.response

    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'update-professional')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.full_name !== undefined) {
      const name = sanitizeString(body.full_name)
      if (!name) return NextResponse.json({ error: 'שם מלא נדרש', requestId }, { status: 400 })
      payload.full_name = name
    }
    let normalizedPrimary: string | undefined
    if (body.phone !== undefined) {
      const phoneParsed = parseWorkerPhone(body.phone, 'מספר טלפון ראשי')
      if (!phoneParsed.ok) {
        return NextResponse.json({ error: phoneParsed.error, requestId }, { status: 400 })
      }
      normalizedPrimary = phoneParsed.normalized
      payload.phone = normalizedPrimary
    }
    if (body.extra_phones !== undefined) {
      const { data: existingPro } = await supabase
        .from('professionals')
        .select('phone')
        .eq('id', professional_id)
        .eq('client_id', clientId)
        .maybeSingle()
      const phoneForExtra =
        normalizedPrimary ??
        (normalizeWorkerPhone(existingPro?.phone || '') || existingPro?.phone || '')
      const extraSanitized = sanitizeExtraPhones(phoneForExtra, body.extra_phones)
      if (!extraSanitized.ok) {
        return NextResponse.json({ error: extraSanitized.error, requestId }, { status: 400 })
      }
      payload.extra_phones = extraSanitized.phones
    }
    if (body.trade !== undefined) payload.trade = body.trade ? sanitizeString(String(body.trade)) : null
    if (body.company_name !== undefined) {
      payload.company_name = body.company_name ? sanitizeString(String(body.company_name)) : null
    }
    if (body.email !== undefined) {
      const emailRaw = body.email != null ? String(body.email).trim() : ''
      payload.email = emailRaw && emailRaw !== '' ? emailRaw : null
    }
    if (body.notes !== undefined) payload.notes = body.notes ? sanitizeString(String(body.notes)) : null
    if (body.is_active !== undefined) payload.is_active = body.is_active

    const { data, error } = await supabase
      .from('professionals')
      .update(payload)
      .eq('id', professional_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'לא נמצא או שגיאת שמירה', requestId }, { status: error ? 500 : 404 })
    }

    return NextResponse.json({ professional: data, requestId })
  } catch {
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
