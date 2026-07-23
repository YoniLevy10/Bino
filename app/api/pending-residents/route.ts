import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeWhatsAppPhoneDigits } from '@/lib/whatsapp-test-phone'
import { isWhatsAppPlaceholderResident } from '@/lib/residents-whatsapp'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { pendingResidentsQueryUnavailable } from '@/lib/supabase-table-errors'
import { checkRateLimitDistributed, sanitizeId, sanitizeString } from '@/lib/api-validation'
import { pendingResidentsApproveBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { getLogger, getAuditLogger } from '@/lib/logging'

const MIGRATION_HINT =
  'הריצו ב-Supabase את המיגרציה supabase/migrations/015_pending_resident_join_requests.sql (או supabase db push) כדי ליצור את הטבלה.'

function formatPhoneForResident(digits: string): string {
  const d = normalizeWhatsAppPhoneDigits(digits)
  if (!d) return ''
  if (d.startsWith('972')) return `+${d}`
  if (d.startsWith('0')) return `+972${d.slice(1)}`
  return `+${d}`
}

type PendingRow = {
  id: string
  client_id: string
  project_id: string
  ticket_id: string | null
  reporter_phone_normalized: string
  status: string
  created_at: string
}

export async function GET() {
  const logger = getLogger()
  const requestId = `pending-residents-${Date.now()}`
  try {
    const auth = await requireSessionClientIdWithNavFeature('pending_residents')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const supabase = getSupabaseAdmin()
    // light rate limit: list is sensitive PII-ish
    const rl = await checkRateLimitDistributed({
      supabaseAdmin: supabase,
      key: `global:pending-residents:GET`,
      windowMs: 60_000,
      maxRequests: 120,
    })
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const { data: rows, error } = await supabase
      .from('pending_resident_join_requests')
      .select('id, client_id, project_id, ticket_id, reporter_phone_normalized, status, created_at')
      .eq('client_id', clientId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      if (pendingResidentsQueryUnavailable(error)) {
        return NextResponse.json({
          items: [] as unknown[],
          tableMissing: true,
          hint: MIGRATION_HINT,
          requestId,
        })
      }
      logger.error('RESIDENTS_API', 'pending-residents query failed', new Error(error.message), { requestId, clientId })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const list = (rows || []) as PendingRow[]
    const projectIds = [...new Set(list.map((r) => r.project_id))]
    const ticketIds = list.map((r) => r.ticket_id).filter((id): id is string => !!id)
    const [projectsRes, ticketsRes] = await Promise.all([
      projectIds.length > 0
        ? supabase.from('projects').select('id, name, project_code').in('id', projectIds)
        : Promise.resolve({ data: [] as { id: string; name: string; project_code: string }[] }),
      ticketIds.length > 0
        ? supabase
            .from('tickets')
            .select('id, ticket_number')
            .in('id', ticketIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as { id: string; ticket_number: number }[] }),
    ])
    const projects = projectsRes.data
    const tickets = ticketsRes.data

    const byProject = new Map((projects as { id: string; name: string; project_code: string }[] | null)?.map((p) => [p.id, p]) || [])
    const byTicket = new Map((tickets as { id: string; ticket_number: number }[] | null)?.map((t) => [t.id, t]) || [])

    return NextResponse.json({
      items: list.map((r) => ({
        ...r,
        project_name: byProject.get(r.project_id)?.name || '',
        project_code: byProject.get(r.project_id)?.project_code || '',
        ticket_number: r.ticket_id ? byTicket.get(r.ticket_id)?.ticket_number : undefined,
      })),
      requestId,
    })
  } catch (e) {
    console.error('[pending-residents]', e)
    logger.error('RESIDENTS_API', 'Unhandled pending-residents GET error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `pending-residents-patch-${Date.now()}`
  try {
    const auth = await requireSessionClientIdWithNavFeature('pending_residents', 'manager')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const supabase = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'pending-residents-patch')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }
    const rawBody = await req.json()
    const parsed = pendingResidentsApproveBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error), requestId }, { status: 400 })
    }

    const id = parsed.data.id
    const action = parsed.data.action

    const { data: row, error: fetchErr } = await supabase
      .from('pending_resident_join_requests')
      .select('id, client_id, project_id, ticket_id, reporter_phone_normalized, status')
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle()

    if (fetchErr && pendingResidentsQueryUnavailable(fetchErr)) {
      return NextResponse.json(
        { error: 'טבלת בקשות דיירים עדיין לא קיימת במסד הנתונים.', hint: MIGRATION_HINT, code: 'MIGRATION_REQUIRED', requestId },
        { status: 503 }
      )
    }
    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Not found', requestId }, { status: 404 })
    }

    if ((row as { status: string }).status !== 'pending') {
      return NextResponse.json({ error: 'Already resolved', requestId }, { status: 400 })
    }

    const now = new Date().toISOString()

    if (action === 'reject') {
      const { error: up } = await supabase
        .from('pending_resident_join_requests')
        .update({
          status: 'rejected',
          resolved_at: now,
          resolved_by: 'dashboard',
        })
        .eq('id', id)
        .eq('client_id', clientId)

      if (up) {
        if (pendingResidentsQueryUnavailable(up)) {
          return NextResponse.json({ error: up.message, hint: MIGRATION_HINT, code: 'MIGRATION_REQUIRED', requestId }, { status: 503 })
        }
        logger.error('RESIDENTS_API', 'Reject pending resident failed', new Error(up.message), { requestId, id, clientId })
        audit.logFailedOperation('REJECT', 'PENDING_RESIDENT', id, clientId, up.message)
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }
      audit.logAction('REJECT', 'PENDING_RESIDENT', id, clientId, 'dashboard')
      return NextResponse.json({ ok: true, status: 'rejected', requestId })
    }

    const fullName = sanitizeString(parsed.data.full_name)
    if (!fullName) {
      return NextResponse.json({ error: 'נדרש שם מלא לאישור דייר', requestId }, { status: 400 })
    }
    const apartmentNumber = sanitizeString(parsed.data.apartment_number) || null
    const digits = normalizeWhatsAppPhoneDigits((row as { reporter_phone_normalized: string }).reporter_phone_normalized)
    const phone = formatPhoneForResident(digits)

    // Check if resident with this phone already exists (exclude soft-deleted)
    const phoneDigits = phone.replace(/^\+/, '')
    const { data: existing } = await supabase
      .from('residents')
      .select('id, full_name, normalized_phone, phone')
      .eq('client_id', clientId)
      .eq('project_id', (row as { project_id: string }).project_id)
      .or(`normalized_phone.eq.${digits},phone.eq.${phoneDigits},phone.eq.+${phoneDigits}`)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing && !isWhatsAppPlaceholderResident(existing as { full_name?: string | null })) {
      logger.warn('RESIDENTS_API', 'Resident with phone already exists - auto-rejecting pending request', { requestId, id, clientId, phone })
      await supabase
        .from('pending_resident_join_requests')
        .update({ status: 'rejected', resolved_at: now, resolved_by: 'dashboard_auto_duplicate' })
        .eq('id', id)
        .eq('client_id', clientId)
      audit.logFailedOperation('APPROVE', 'PENDING_RESIDENT', id, clientId, 'Resident with this phone already exists - auto-rejected')
      return NextResponse.json({ error: 'דייר עם מספר טלפון זה כבר קיים במערכת', requestId }, { status: 400 })
    }

    if (existing && isWhatsAppPlaceholderResident(existing as { full_name?: string | null })) {
      const { error: upResidentErr } = await supabase
        .from('residents')
        .update({
          full_name: fullName,
          phone,
          apartment_number: apartmentNumber,
          normalized_phone: digits,
          notes: 'אושר לאחר בקשת הצטרפות מוואטסאפ',
        })
        .eq('id', (existing as { id: string }).id)
        .eq('client_id', clientId)

      if (upResidentErr) {
        logger.error('RESIDENTS_API', 'Update placeholder resident failed', new Error(upResidentErr.message), { requestId, id, clientId })
        audit.logFailedOperation('APPROVE', 'PENDING_RESIDENT', id, clientId, upResidentErr.message)
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }
    } else {
      const { error: insErr } = await supabase.from('residents').insert({
        project_id: (row as { project_id: string }).project_id,
        client_id: clientId,
        full_name: fullName,
        phone,
        normalized_phone: digits,
        apartment_number: apartmentNumber,
        notes: 'נוסף לאחר אישור בקשת הצטרפות מוואטסאפ',
      })

      if (insErr) {
        if (insErr.message?.includes('idx_residents_client_phone_unique')) {
          logger.warn('RESIDENTS_API', 'Duplicate resident during insert', { requestId, id, clientId, phone, error: insErr.message })
          audit.logFailedOperation('APPROVE', 'PENDING_RESIDENT', id, clientId, 'Duplicate phone detected during insert')
          return NextResponse.json({ error: 'דייר עם מספר טלפון זה כבר קיים במערכת', requestId }, { status: 400 })
        }
        logger.error('RESIDENTS_API', 'Insert resident failed', new Error(insErr.message), { requestId, id, clientId })
        audit.logFailedOperation('APPROVE', 'PENDING_RESIDENT', id, clientId, insErr.message)
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }
    }

    const { error: up } = await supabase
      .from('pending_resident_join_requests')
      .update({
        status: 'approved',
        resolved_at: now,
        resolved_by: 'dashboard',
      })
      .eq('id', id)
      .eq('client_id', clientId)

    if (up) {
      if (pendingResidentsQueryUnavailable(up)) {
        return NextResponse.json({ error: up.message, hint: MIGRATION_HINT, code: 'MIGRATION_REQUIRED', requestId }, { status: 503 })
      }
      logger.error('RESIDENTS_API', 'Approve pending resident update failed', new Error(up.message), { requestId, id, clientId })
      audit.logFailedOperation('APPROVE', 'PENDING_RESIDENT', id, clientId, up.message)
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }
    audit.logAction('APPROVE', 'PENDING_RESIDENT', id, clientId, 'dashboard')
    return NextResponse.json({ ok: true, status: 'approved', requestId })
  } catch (e) {
    console.error('[pending-residents]', e)
    logger.error('RESIDENTS_API', 'Unhandled pending-residents PATCH error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
