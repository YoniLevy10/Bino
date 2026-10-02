import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { bulkSendCollectionChargesBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { runAfterResponse } from '@/lib/run-after-response'
import {
  getCollectionBulkSendRun,
  processCollectionBulkSendRun,
} from '@/lib/collection-bulk-send'
import { loadClientCollectionsRow } from '@/lib/collection-charge-ops'

export const maxDuration = 60

export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const runId = new URL(req.url).searchParams.get('run_id')
  if (!runId) {
    return NextResponse.json({ error: 'run_id חסר' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const run = await getCollectionBulkSendRun(admin, auth.ctx.clientId, runId)
  if (!run) return NextResponse.json({ error: 'רצה לא נמצאה' }, { status: 404 })
  return NextResponse.json(run)
}

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections, { write: true })
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

  const clientRow = await loadClientCollectionsRow(admin, clientId)
  if (!clientRow) {
    return NextResponse.json({ error: 'לא נמצאו הגדרות לקוח' }, { status: 500 })
  }

  const batchId = randomUUID()
  const titleTemplate = body.title_template.trim()
  const periodLabel = body.period_label?.trim() || null
  const description = body.description?.trim() || null

  const { data: runRow, error: insertErr } = await admin
    .from('collection_bulk_send_runs')
    .insert({
      client_id: clientId,
      project_id: body.project_id,
      batch_id: batchId,
      created_by: auth.ctx.userId,
      status: 'queued',
      items_total: body.items.length,
      created_count: 0,
      sent_count: 0,
      failed_count: 0,
      next_index: 0,
      title_template: titleTemplate,
      period_label: periodLabel,
      description,
      send_sms: sendSms,
      items: body.items,
    })
    .select('id')
    .single()

  if (insertErr || !runRow) {
    return NextResponse.json(
      { error: insertErr?.message || 'יצירת רצת שליחה נכשלה — הריצו מיגרציה 119' },
      { status: 500 }
    )
  }

  const runId = (runRow as { id: string }).id
  runAfterResponse('collections-bulk-send', async () => {
    await processCollectionBulkSendRun(admin, { runId, clientId })
  })

  return NextResponse.json(
    {
      run_id: runId,
      batch_id: batchId,
      status: 'queued',
      items_total: body.items.length,
      created: 0,
      sent: 0,
      failed: 0,
    },
    { status: 202 }
  )
}
