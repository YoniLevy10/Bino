import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { sendCollectionChargeBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import type { CollectionChargeRow } from '@/lib/collection-charges'
import {
  loadClientGreenInvoiceRow,
  sendCollectionCharge,
  type ChargeProjectInfo,
  type ChargeResidentInfo,
  type ClientCollectionsRow,
} from '@/lib/collection-charge-ops'

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'collections-send-charge')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const validated = sendCollectionChargeBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const clientId = auth.ctx.clientId
  const { data: charge, error } = await admin
    .from('collection_charges')
    .select('*')
    .eq('id', validated.data.charge_id)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error || !charge) {
    return NextResponse.json({ error: 'חיוב לא נמצא' }, { status: 404 })
  }

  const row = charge as CollectionChargeRow
  let resident: ChargeResidentInfo | null = null
  let project: ChargeProjectInfo | null = null

  if (row.resident_id) {
    const { data } = await admin
      .from('residents')
      .select('id, full_name, phone, normalized_phone, apartment_number, email')
      .eq('id', row.resident_id)
      .eq('client_id', clientId)
      .maybeSingle()
    resident = (data as ChargeResidentInfo) || null
  }
  if (row.project_id) {
    const { data } = await admin
      .from('projects')
      .select('id, name')
      .eq('id', row.project_id)
      .eq('client_id', clientId)
      .maybeSingle()
    project = (data as ChargeProjectInfo) || null
  }

  const clientRow = (await loadClientGreenInvoiceRow(admin, clientId)) as ClientCollectionsRow | null
  if (!clientRow) {
    return NextResponse.json({ error: 'לא נמצאו הגדרות לקוח' }, { status: 500 })
  }

  const result = await sendCollectionCharge(admin, {
    clientId,
    charge: row,
    resident,
    project,
    clientRow,
    sendSms: validated.data.send_sms !== false,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 })
  }

  return NextResponse.json({
    charge: result.charge,
    sms_sent: result.smsSent,
    pay_url: result.payUrl,
  })
}
