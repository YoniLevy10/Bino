import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  checkAuthenticatedPostRouteLimit,
  checkAuthenticatedReadRouteLimit,
} from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import {
  createCollectionChargeBodySchema,
} from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import {
  COLLECTION_CHARGE_LIST_SELECT,
  COLLECTION_CHARGE_ROW_SELECT,
  COLLECTION_CHARGE_STATUSES,
  isCollectionChargeStatus,
  type CollectionChargeListItem,
  type CollectionChargeRow,
} from '@/lib/collection-charges'
import {
  loadClientCollectionsRow,
  sendCollectionCharge,
  type ChargeProjectInfo,
  type ChargeResidentInfo,
  type ClientCollectionsRow,
} from '@/lib/collection-charge-ops'

export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'collections-charges-list')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim() || ''
  const statusRaw = url.searchParams.get('status')?.trim() || ''
  const q = url.searchParams.get('q')?.trim() || ''
  const periodLabel = url.searchParams.get('period_label')?.trim() || ''
  const batchId = url.searchParams.get('batch_id')?.trim() || ''
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') || '50') || 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = admin
    .from('collection_charges')
    .select(COLLECTION_CHARGE_LIST_SELECT, { count: 'exact' })
    .eq('client_id', auth.ctx.clientId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (projectId) query = query.eq('project_id', projectId)
  if (periodLabel) query = query.eq('period_label', periodLabel)
  if (batchId) query = query.eq('batch_id', batchId)
  if (statusRaw && statusRaw !== 'all' && isCollectionChargeStatus(statusRaw)) {
    query = query.eq('status', statusRaw)
  } else if (statusRaw && statusRaw !== 'all') {
    return NextResponse.json(
      { error: `סטטוס לא תקין. אפשרויות: ${COLLECTION_CHARGE_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let items = (data || []) as unknown as CollectionChargeListItem[]
  if (q) {
    const needle = q.toLowerCase()
    items = items.filter((row) => {
      const name = row.residents?.full_name?.toLowerCase() || ''
      const apt = row.residents?.apartment_number?.toLowerCase() || ''
      const phone = (row.residents?.phone || row.residents?.normalized_phone || '').toLowerCase()
      const title = row.title?.toLowerCase() || ''
      return (
        name.includes(needle) ||
        apt.includes(needle) ||
        phone.includes(needle) ||
        title.includes(needle)
      )
    })
  }

  return NextResponse.json({
    items,
    page,
    page_size: pageSize,
    total: count ?? items.length,
  })
}

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'collections-create-charge')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const validated = createCollectionChargeBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const body = validated.data
  const clientId = auth.ctx.clientId

  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id, name')
    .eq('id', body.project_id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (projectErr || !project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const { data: resident, error: residentErr } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone, apartment_number, email, project_id')
    .eq('id', body.resident_id)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()
  if (residentErr || !resident) {
    return NextResponse.json({ error: 'דייר לא נמצא' }, { status: 404 })
  }
  if (resident.project_id !== body.project_id) {
    return NextResponse.json({ error: 'הדייר אינו שייך לפרויקט שנבחר' }, { status: 400 })
  }

  const { data: inserted, error: insertErr } = await admin
    .from('collection_charges')
    .insert({
      client_id: clientId,
      project_id: body.project_id,
      resident_id: body.resident_id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      amount: body.amount,
      currency: 'ILS',
      status: 'draft',
      period_label: body.period_label?.trim() || null,
      created_by: auth.ctx.userId,
    })
    .select(COLLECTION_CHARGE_ROW_SELECT)
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message || 'יצירת חיוב נכשלה' }, { status: 500 })
  }

  let charge = inserted as unknown as CollectionChargeRow

  if (body.send) {
    const clientRow = (await loadClientCollectionsRow(admin, clientId)) as ClientCollectionsRow | null
    if (!clientRow) {
      return NextResponse.json({ error: 'לא נמצאו הגדרות לקוח' }, { status: 500 })
    }
    const sent = await sendCollectionCharge(admin, {
      clientId,
      charge,
      resident: resident as ChargeResidentInfo,
      project: project as ChargeProjectInfo,
      clientRow,
      sendSms: body.send_sms !== false,
    })
    if (!sent.ok) {
      return NextResponse.json(
        { error: sent.error, code: sent.code, charge },
        { status: 400 }
      )
    }
    charge = sent.charge
    return NextResponse.json({ charge, sms_sent: sent.smsSent, pay_url: sent.payUrl })
  }

  return NextResponse.json({ charge })
}
