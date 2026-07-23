import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getClientPlanRow, effectiveMaxBuildings } from '@/lib/plan-limits'
import { getPlanPricingRow } from '@/lib/plan-pricing'
import { sanitizeId, sanitizeString } from '@/lib/api-validation'
import { createProjectBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { requireSessionMinRole } from '@/lib/api-auth'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `create-project-${Date.now()}`
  try {
    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'create-project')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json()
    const validatedProject = createProjectBodySchema.safeParse(rawBody)
    if (!validatedProject.success) {
      return NextResponse.json({ error: validatedProject.error.flatten() }, { status: 400 })
    }
    const d = validatedProject.data
    const clientId = auth.ctx.clientId

    let organizationId = sanitizeId(d.organization_id ?? null)
    if (!organizationId) {
      const { data: mem, error: memErr } = await supabase
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', auth.ctx.userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!memErr && mem?.organization_id) {
        organizationId = sanitizeId(mem.organization_id)
      }
    }
    if (!organizationId) {
      return NextResponse.json({ error: 'חסר organization_id', requestId }, { status: 400 })
    }
    const { data: orgCheck, error: orgVerErr } = await supabase
      .from('organizations')
      .select('client_id')
      .eq('id', organizationId)
      .maybeSingle()
    if (orgVerErr || !orgCheck || (orgCheck as { client_id?: string }).client_id !== clientId) {
      return NextResponse.json({ error: 'ארגון לא תקף', requestId }, { status: 403 })
    }

    const { data: client, error: cErr } = await getClientPlanRow(supabase, clientId)
    if (cErr || !client) {
      audit.logFailedOperation('READ', 'CLIENT', clientId, clientId, 'client_not_found')
      return NextResponse.json({ error: 'לקוח לא נמצא', requestId }, { status: 404 })
    }

    const maxB = effectiveMaxBuildings(client, await getPlanPricingRow(supabase, client.plan_tier ?? 'starter'))
    const { count, error: countErr } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_active', true)

    if (countErr) {
      logger.error('PROJECT_API', 'Count projects failed', new Error(countErr.message), { requestId, clientId })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const current = count ?? 0
    if (maxB !== null && current >= maxB) {
      return NextResponse.json(
        {
          error: `הגעת למגבלת הבניינים בחבילה שלך (${maxB}). שדרג את החבילה להוסיף עוד.`,
          requestId,
        },
        { status: 403 }
      )
    }

    const payload: Record<string, unknown> = {
      name: sanitizeString(d.name),
      project_code: sanitizeString(d.project_code).toUpperCase(),
      address: d.address ? sanitizeString(d.address) || null : null,
      address_en: d.address_en ? sanitizeString(d.address_en) || null : null,
      qr_identifier: d.qr_identifier ? sanitizeString(d.qr_identifier) || null : null,
      is_active: d.is_active !== false,
      client_id: clientId,
      assigned_worker_id: d.assigned_worker_id && String(d.assigned_worker_id).trim() !== '' ? String(d.assigned_worker_id) : null,
    }
    if (organizationId) {
      payload.organization_id = organizationId
    }

    const projectCode = String(payload.project_code || '')
    const projectName = String(payload.name || '')
    if (!projectName || !projectCode) {
      return NextResponse.json({ error: 'שם וקוד פרויקט נדרשים', requestId }, { status: 400 })
    }
    if (!/^[A-Z0-9_]{2,20}$/.test(projectCode)) {
      return NextResponse.json({ error: 'קוד פרויקט לא תקין', requestId }, { status: 400 })
    }

    const insertPayload = { ...payload, name: projectName, project_code: projectCode }

    const { data: created, error: insErr } = await supabase
      .from('projects')
      .insert(insertPayload)
      .select()
      .single()

    if (insErr) {
      logger.error('PROJECT_API', 'Create project failed', new Error(insErr.message), { requestId, clientId })
      audit.logFailedOperation('CREATE', 'PROJECT', 'unknown', clientId, insErr.message)
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    audit.logAction('CREATE', 'PROJECT', (created as { id?: string } | null)?.id || 'unknown', clientId, 'dashboard')
    logger.info('PROJECT_API', 'Project created', { requestId, clientId })
    return NextResponse.json({ project: created, requestId })
  } catch (e) {
    console.error('[create-project]', e)
    logger.error('PROJECT_API', 'Unhandled create-project error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
