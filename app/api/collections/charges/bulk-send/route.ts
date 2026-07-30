import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { bulkSendCollectionChargesBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import type { CollectionChargeRow } from '@/lib/collection-charges'
import {
  loadClientGreenInvoiceRow,
  sendCollectionCharge,
  type ChargeProjectInfo,
  type ChargeResidentInfo,
  type ClientCollectionsRow,
} from '@/lib/collection-charge-ops'

type BulkItemResult = {
  resident_id: string
  charge_id?: string
  ok: boolean
  sms_sent?: boolean
  pay_url?: string
  error?: string
}

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'collections-bulk-send')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const validated = bulkSendCollectionChargesBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const body = validated.data
  const clientId = auth.ctx.clientId
  const sendSms = body.send_sms !== false

  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id, name')
    .eq('id', body.project_id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (projectErr || !project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const clientRow = (await loadClientGreenInvoiceRow(admin, clientId)) as ClientCollectionsRow | null
  if (!clientRow) {
    return NextResponse.json({ error: 'לא נמצאו הגדרות לקוח' }, { status: 500 })
  }

  const residentIds = body.items.map((i) => i.resident_id)
  const { data: residents, error: residentsErr } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone, apartment_number, email, project_id')
    .eq('client_id', clientId)
    .eq('project_id', body.project_id)
    .in('id', residentIds)
    .is('deleted_at', null)

  if (residentsErr) {
    return NextResponse.json({ error: residentsErr.message }, { status: 500 })
  }

  const byId = new Map(
    ((residents || []) as Array<ChargeResidentInfo>).map((r) => [r.id, r])
  )

  const batchId = randomUUID()
  const titleTemplate = body.title_template.trim()
  const periodLabel = body.period_label?.trim() || null
  const description = body.description?.trim() || null

  const results: BulkItemResult[] = []
  let created = 0
  let sent = 0
  let failed = 0

  for (const item of body.items) {
    const resident = byId.get(item.resident_id)
    if (!resident) {
      failed += 1
      results.push({
        resident_id: item.resident_id,
        ok: false,
        error: 'דייר לא נמצא בפרויקט',
      })
      continue
    }

    if (sendSms && !(resident.normalized_phone?.trim() || resident.phone?.trim())) {
      failed += 1
      results.push({
        resident_id: item.resident_id,
        ok: false,
        error: 'אין טלפון לדייר',
      })
      continue
    }

    const apt = resident.apartment_number?.trim()
    const title = apt
      ? `${titleTemplate} — דירה ${apt}`
      : `${titleTemplate} — ${resident.full_name}`

    const { data: inserted, error: insertErr } = await admin
      .from('collection_charges')
      .insert({
        client_id: clientId,
        project_id: body.project_id,
        resident_id: item.resident_id,
        title,
        description,
        amount: item.amount,
        currency: 'ILS',
        status: 'draft',
        period_label: periodLabel,
        batch_id: batchId,
        created_by: auth.ctx.userId,
      })
      .select('*')
      .single()

    if (insertErr || !inserted) {
      failed += 1
      results.push({
        resident_id: item.resident_id,
        ok: false,
        error: insertErr?.message || 'יצירת חיוב נכשלה',
      })
      continue
    }

    created += 1
    const charge = inserted as CollectionChargeRow

    const sendResult = await sendCollectionCharge(admin, {
      clientId,
      charge,
      resident,
      project: project as ChargeProjectInfo,
      clientRow,
      sendSms,
    })

    if (!sendResult.ok) {
      failed += 1
      results.push({
        resident_id: item.resident_id,
        charge_id: charge.id,
        ok: false,
        error: sendResult.error,
      })
      continue
    }

    sent += 1
    results.push({
      resident_id: item.resident_id,
      charge_id: sendResult.charge.id,
      ok: true,
      sms_sent: sendResult.smsSent,
      pay_url: sendResult.payUrl,
    })
  }

  return NextResponse.json({
    batch_id: batchId,
    created,
    sent,
    failed,
    results,
  })
}
