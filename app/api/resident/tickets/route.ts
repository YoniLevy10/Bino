import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { createTicketShared } from '@/lib/tickets/create-ticket-service'
import type { TicketScope } from '@/lib/resident-portal/types'
import { buildMidragSearchUrl, midragCityMatchForCity } from '@/lib/midrag/external-search'

const RESIDENT_TICKET_SELECT = `
  id, ticket_number, status, description, scope, opened_at, closed_at, updated_at, created_at
`.replace(/\s+/g, ' ').trim()

export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('tickets')
    .select(RESIDENT_TICKET_SELECT)
    .eq('client_id', auth.ctx.membership.client_id)
    .eq('reporter_membership_id', auth.ctx.membership.id)
    .is('deleted_at', null)
    .order('opened_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[resident/tickets GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tickets: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireResidentContext({ request: req })
  if (!auth.ok) return auth.response

  const contentType = req.headers.get('content-type') || ''
  let description = ''
  let scope: TicketScope = 'unclear'
  let idempotencyKey: string | null = null
  let tradeCategory = 'other'
  let files: File[] = []

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      description = String(form.get('description') || '').trim()
      const s = String(form.get('scope') || 'unclear')
      scope = ['common', 'private', 'unclear'].includes(s) ? (s as TicketScope) : 'unclear'
      idempotencyKey = String(form.get('idempotency_key') || '').trim() || null
      tradeCategory = String(form.get('trade_category') || 'other').trim() || 'other'
      files = form.getAll('attachments').filter((f) => f instanceof File) as File[]
    } else {
      const body = await req.json()
      description = String(body.description || '').trim()
      const s = String(body.scope || 'unclear')
      scope = ['common', 'private', 'unclear'].includes(s) ? (s as TicketScope) : 'unclear'
      idempotencyKey =
        typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() || null : null
      tradeCategory =
        typeof body.trade_category === 'string' ? body.trade_category.trim() || 'other' : 'other'
    }
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  try {
    const created = await createTicketShared(auth.ctx.admin, {
      clientId: auth.ctx.membership.client_id,
      projectId: auth.ctx.membership.project_id,
      description,
      source: 'portal',
      reporterName: auth.ctx.membership.resident_name,
      residentId: auth.ctx.membership.resident_id,
      unitId: auth.ctx.membership.unit_id,
      reporterMembershipId: auth.ctx.membership.id,
      scope,
      portalIdempotencyKey: idempotencyKey,
      files,
      autoAssign: scope !== 'private',
      skipPendingResident: true,
    })

    let midragUrl: string | null = null
    if (scope === 'private') {
      const city = auth.ctx.membership.project_city
      if (midragCityMatchForCity(city)) {
        midragUrl = buildMidragSearchUrl({ category: tradeCategory, city })
      }
    }

    return NextResponse.json({
      ok: true,
      ticketId: created.ticketId,
      ticketNumber: created.ticketNumber,
      reused: created.reused,
      scope: created.scope,
      imageUploadWarning: created.imageUploadWarning,
      midragUrl,
      note:
        scope === 'private'
          ? 'תקלה פרטית — לא משובצת אוטומטית לעובדי הניהול. פתיחת מידרג אינה הזמנה.'
          : null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'פתיחת קריאה נכשלה'
    console.error('[resident/tickets POST]', e)
    const code = (e as { code?: string }).code
    return NextResponse.json(
      { error: msg, code },
      { status: code === 'PLAN_LIMIT' ? 403 : 400 }
    )
  }
}
