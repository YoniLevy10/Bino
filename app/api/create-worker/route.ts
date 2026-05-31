import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getClientPlanRow, effectiveMaxWorkers } from '@/lib/plan-limits'
import { sanitizeId, sanitizeString } from '@/lib/api-validation'
import { createWorkerBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { requireSessionClientId } from '@/lib/api-auth'
import { sanitizeExtraPhones } from '@/lib/worker-phones'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `create-worker-${Date.now()}`
  try {
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!hasServiceRoleKey) {
      return NextResponse.json(
        {
          error:
            'חסר SUPABASE_SERVICE_ROLE_KEY בשרת. מלאו אותו ב-`.env.local` והפעילו מחדש את השרת.',
          requestId,
        },
        { status: 500 }
      )
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsedWorker = createWorkerBodySchema.safeParse(rawBody)
    if (!parsedWorker.success) {
      return NextResponse.json({ error: parsedWorker.error.flatten() }, { status: 400 })
    }
    const body = parsedWorker.data

    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    let supabase
    try {
      supabase = getSupabaseAdmin()
    } catch (e) {
      console.error('[create-worker]', e)
      throw e
    }
    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'create-worker')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }
    const clientId = auth.ctx.clientId

    const orgId = body.organization_id ? sanitizeId(body.organization_id) : null
    if (orgId) {
      const { data: orgCheck, error: orgVerErr } = await supabase
        .from('organizations')
        .select('client_id')
        .eq('id', orgId)
        .maybeSingle()
      if (orgVerErr || !orgCheck || (orgCheck as { client_id?: string }).client_id !== clientId) {
        return NextResponse.json({ error: 'ארגון לא תקף', requestId }, { status: 403 })
      }
    }

    const { data: client, error: cErr } = await getClientPlanRow(supabase, clientId)
    if (cErr || !client) {
      audit.logFailedOperation('READ', 'CLIENT', clientId, clientId, 'client_not_found')
      return NextResponse.json({ error: 'לקוח לא נמצא', requestId }, { status: 404 })
    }

    const maxW = effectiveMaxWorkers(client)
    const { count, error: countErr } = await supabase
      .from('workers')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_active', true)
      .is('deleted_at', null)

    if (countErr) {
      logger.error('WORKER_API', 'Count workers failed', new Error(countErr.message), { requestId, clientId })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const current = count ?? 0
    if (maxW !== null && current >= maxW) {
      return NextResponse.json(
        {
          error: `הגעת למגבלת העובדים בחבילה שלך (${maxW}). שדרג את החבילה.`,
          requestId,
        },
        { status: 403 }
      )
    }

    const payload: Record<string, unknown> = {
      client_id: clientId,
      full_name: sanitizeString(body.full_name),
      phone: body.phone ? sanitizeString(body.phone) : null,
      email: body.email ? sanitizeString(String(body.email)) : null,
      role: body.role ? sanitizeString(String(body.role)) : null,
      is_active: body.is_active !== false,
    }
    if (orgId) {
      payload.organization_id = orgId
    }

    const fullName = String(payload.full_name || '')
    if (!fullName) {
      return NextResponse.json({ error: 'שם מלא נדרש', requestId }, { status: 400 })
    }
    const phoneStr = payload.phone != null ? String(payload.phone) : ''
    if (phoneStr && phoneStr.replace(/\D/g, '').length < 9) {
      return NextResponse.json({ error: 'מספר טלפון לא תקין', requestId }, { status: 400 })
    }
    const emailStr = payload.email != null ? String(payload.email) : ''
    if (!emailStr) {
      return NextResponse.json({ error: 'נדרש אימייל לעובד', requestId }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      return NextResponse.json({ error: 'אימייל לא תקין', requestId }, { status: 400 })
    }

    const extraRaw = body.extra_phones ?? []
    const extraSanitized = sanitizeExtraPhones(phoneStr, extraRaw)
    if (!extraSanitized.ok) {
      return NextResponse.json({ error: extraSanitized.error, requestId }, { status: 400 })
    }

    const insertPayload = {
      ...payload,
      full_name: fullName,
      phone: phoneStr || null,
      email: emailStr || null,
      extra_phones: extraSanitized.phones,
    }

    const { data: created, error: insErr } = await supabase
      .from('workers')
      .insert(insertPayload)
      .select()
      .single()

    if (insErr) {
      console.error('[create-worker]', insErr.message, { requestId })
      logger.error('WORKER_API', 'Create worker failed', new Error(insErr.message), { requestId, clientId })
      audit.logFailedOperation('CREATE', 'WORKER', 'unknown', clientId, insErr.message)
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    audit.logAction('CREATE', 'WORKER', (created as { id?: string } | null)?.id || 'unknown', clientId, 'dashboard')
    logger.info('WORKER_API', 'Worker created', { requestId, clientId })
    return NextResponse.json({ worker: created, requestId })
  } catch (e) {
    console.error('[create-worker]', e)
    logger.error('WORKER_API', 'Unhandled create-worker error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
