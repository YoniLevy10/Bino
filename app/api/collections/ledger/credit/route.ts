import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { postUnitLedgerCreditBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { ledgerIdempotencyKey, postLedgerCredit } from '@/lib/unit-ledger'

/** POST — record a credit (יתרת זכות) on a unit / resident ledger. */
export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections, { write: true })
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'collections-ledger-credit'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const validated = postUnitLedgerCreditBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const body = validated.data
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', body.project_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  let unitId = body.unit_id || null
  const residentId = body.resident_id || null

  if (residentId) {
    const { data: resident } = await admin
      .from('residents')
      .select('id, unit_id, project_id')
      .eq('id', residentId)
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!resident) {
      return NextResponse.json({ error: 'דייר לא נמצא' }, { status: 404 })
    }
    if (resident.project_id !== body.project_id) {
      return NextResponse.json({ error: 'הדייר אינו שייך לפרויקט' }, { status: 400 })
    }
    if (!unitId && resident.unit_id) unitId = resident.unit_id
  }

  if (unitId) {
    const { data: unit } = await admin
      .from('project_units')
      .select('id, project_id')
      .eq('id', unitId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (!unit) {
      return NextResponse.json({ error: 'דירה לא נמצאה' }, { status: 404 })
    }
    if (unit.project_id !== body.project_id) {
      return NextResponse.json({ error: 'הדירה אינה שייכת לפרויקט' }, { status: 400 })
    }
  }

  const clientKey = (body.idempotency_key || '').trim() || randomUUID()
  const result = await postLedgerCredit(admin, {
    clientId: auth.ctx.clientId,
    projectId: body.project_id,
    unitId,
    residentId,
    amount: body.amount,
    description: body.description || 'יתרת זכות',
    receiptNote: body.receipt_note || null,
    idempotencyKey: ledgerIdempotencyKey('credit', body.project_id, clientKey),
    createdBy: auth.ctx.userId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true, entry: result.entry, replay: result.replay })
}
