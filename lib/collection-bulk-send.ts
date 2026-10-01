import type { SupabaseClient } from '@supabase/supabase-js'
import type { CollectionChargeRow } from '@/lib/collection-charges'
import {
  loadClientCollectionsRow,
  sendCollectionCharge,
  type ChargeProjectInfo,
  type ChargeResidentInfo,
  type ClientCollectionsRow,
} from '@/lib/collection-charge-ops'

export type BulkSendItem = { resident_id: string; amount: number }

export type CollectionBulkSendRunSnap = {
  run_id: string
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  items_total: number
  created: number
  sent: number
  failed: number
  error_message?: string | null
}

type RunRow = {
  id: string
  client_id: string
  project_id: string
  batch_id: string
  status: string
  items_total: number
  created_count: number
  sent_count: number
  failed_count: number
  next_index: number
  title_template: string
  period_label: string | null
  description: string | null
  send_sms: boolean
  items: BulkSendItem[] | unknown
  error_message: string | null
}

function parseItems(raw: unknown): BulkSendItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (i): i is BulkSendItem =>
      !!i &&
      typeof i === 'object' &&
      typeof (i as BulkSendItem).resident_id === 'string' &&
      typeof (i as BulkSendItem).amount === 'number'
  )
}

export async function getCollectionBulkSendRun(
  admin: SupabaseClient,
  clientId: string,
  runId: string
): Promise<CollectionBulkSendRunSnap | null> {
  const { data, error } = await admin
    .from('collection_bulk_send_runs')
    .select(
      'id, batch_id, status, items_total, created_count, sent_count, failed_count, error_message'
    )
    .eq('client_id', clientId)
    .eq('id', runId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as {
    id: string
    batch_id: string
    status: CollectionBulkSendRunSnap['status']
    items_total: number
    created_count: number
    sent_count: number
    failed_count: number
    error_message: string | null
  }
  return {
    run_id: row.id,
    batch_id: row.batch_id,
    status: row.status,
    items_total: row.items_total,
    created: row.created_count,
    sent: row.sent_count,
    failed: row.failed_count,
    error_message: row.error_message,
  }
}

export async function processCollectionBulkSendRun(
  admin: SupabaseClient,
  opts: { runId: string; clientId: string }
): Promise<void> {
  const { data: run, error } = await admin
    .from('collection_bulk_send_runs')
    .select('*')
    .eq('id', opts.runId)
    .eq('client_id', opts.clientId)
    .maybeSingle()
  if (error || !run) throw new Error(error?.message || 'רצה לא נמצאה')

  const row = run as RunRow
  if (row.status === 'completed' || row.status === 'failed') return

  await admin
    .from('collection_bulk_send_runs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('client_id', opts.clientId)

  const items = parseItems(row.items)
  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id, name')
    .eq('id', row.project_id)
    .eq('client_id', opts.clientId)
    .maybeSingle()
  if (projectErr || !project) {
    await markFailed(admin, row.id, opts.clientId, 'פרויקט לא נמצא')
    return
  }

  const clientRow = (await loadClientCollectionsRow(admin, opts.clientId)) as ClientCollectionsRow | null
  if (!clientRow) {
    await markFailed(admin, row.id, opts.clientId, 'לא נמצאו הגדרות לקוח')
    return
  }

  const residentIds = items.map((i) => i.resident_id)
  const { data: residents } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone, apartment_number, email, project_id')
    .eq('client_id', opts.clientId)
    .eq('project_id', row.project_id)
    .in('id', residentIds.length ? residentIds : ['00000000-0000-0000-0000-000000000000'])
    .is('deleted_at', null)

  const byId = new Map(
    ((residents || []) as Array<ChargeResidentInfo>).map((r) => [r.id, r])
  )

  let created = row.created_count
  let sent = row.sent_count
  let failed = row.failed_count
  let idx = row.next_index

  while (idx < items.length) {
    const item = items[idx]
    idx += 1
    const resident = byId.get(item.resident_id)
    if (!resident) {
      failed += 1
      await persistProgress(admin, row.id, opts.clientId, { created, sent, failed, next_index: idx })
      continue
    }

    if (row.send_sms && !(resident.normalized_phone?.trim() || resident.phone?.trim())) {
      failed += 1
      await persistProgress(admin, row.id, opts.clientId, { created, sent, failed, next_index: idx })
      continue
    }

    const apt = resident.apartment_number?.trim()
    const title = apt
      ? `${row.title_template} — דירה ${apt}`
      : `${row.title_template} — ${resident.full_name}`

    const { data: inserted, error: insertErr } = await admin
      .from('collection_charges')
      .insert({
        client_id: opts.clientId,
        project_id: row.project_id,
        resident_id: item.resident_id,
        title,
        description: row.description,
        amount: item.amount,
        currency: 'ILS',
        status: 'draft',
        period_label: row.period_label,
        batch_id: row.batch_id,
        created_by: null,
      })
      .select('*')
      .single()

    if (insertErr || !inserted) {
      failed += 1
      await persistProgress(admin, row.id, opts.clientId, { created, sent, failed, next_index: idx })
      continue
    }

    created += 1
    const charge = inserted as CollectionChargeRow
    const sendResult = await sendCollectionCharge(admin, {
      clientId: opts.clientId,
      charge,
      resident,
      project: project as ChargeProjectInfo,
      clientRow,
      sendSms: row.send_sms,
    })

    if (!sendResult.ok) {
      failed += 1
    } else {
      sent += 1
    }

    if (idx % 5 === 0 || idx >= items.length) {
      await persistProgress(admin, row.id, opts.clientId, { created, sent, failed, next_index: idx })
    }
  }

  await admin
    .from('collection_bulk_send_runs')
    .update({
      status: 'completed',
      created_count: created,
      sent_count: sent,
      failed_count: failed,
      next_index: idx,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('client_id', opts.clientId)
}

async function persistProgress(
  admin: SupabaseClient,
  runId: string,
  clientId: string,
  p: { created: number; sent: number; failed: number; next_index: number }
) {
  await admin
    .from('collection_bulk_send_runs')
    .update({
      created_count: p.created,
      sent_count: p.sent,
      failed_count: p.failed,
      next_index: p.next_index,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('client_id', clientId)
}

async function markFailed(
  admin: SupabaseClient,
  runId: string,
  clientId: string,
  message: string
) {
  await admin
    .from('collection_bulk_send_runs')
    .update({
      status: 'failed',
      error_message: message,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('client_id', clientId)
}

/** Resume stale queued/running runs (cron). */
export async function resumeStaleCollectionBulkSendRuns(
  admin: SupabaseClient,
  opts?: { staleMinutes?: number; limit?: number }
): Promise<number> {
  const staleMinutes = opts?.staleMinutes ?? 5
  const limit = opts?.limit ?? 10
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString()
  const { data, error } = await admin
    .from('collection_bulk_send_runs')
    .select('id, client_id')
    .in('status', ['queued', 'running'])
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  let n = 0
  for (const r of data || []) {
    const row = r as { id: string; client_id: string }
    await processCollectionBulkSendRun(admin, { runId: row.id, clientId: row.client_id })
    n += 1
  }
  return n
}
