/**
 * Insights sync — persist snapshots; idempotent upserts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMetaDataLabel, getMetaGraphBaseUrl, getMetaMode } from '@/lib/mbrain/meta/client'
import { mbrainLog } from '@/lib/mbrain/logging'

export type InsightRow = {
  level: 'campaign' | 'adset' | 'ad'
  metaExternalId: string
  internalId?: string | null
  brandId?: string | null
  dateStart: string
  dateStop: string
  spend: number
  impressions: number
  reach?: number | null
  clicks: number
  ctr?: number | null
  cpc?: number | null
  cpm?: number | null
  leads: number
  costPerLead?: number | null
  frequency?: number | null
  landingPageViews?: number | null
  raw?: Record<string, unknown>
}

export async function fetchCampaignInsights(opts: {
  adAccountId: string
  accessToken: string | null
  since: string
  until: string
}): Promise<{ label: ReturnType<typeof getMetaDataLabel>; rows: InsightRow[] }> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !opts.accessToken) {
    return {
      label,
      rows: [
        {
          level: 'campaign',
          metaExternalId: 'camp_mock_demo',
          dateStart: opts.since,
          dateStop: opts.until,
          spend: 0,
          impressions: 0,
          clicks: 0,
          leads: 0,
          raw: { mock: true, note: 'No spend until live campaigns report' },
        },
      ],
    }
  }

  const accountId = opts.adAccountId.startsWith('act_') ? opts.adAccountId : `act_${opts.adAccountId}`
  const url = new URL(`${getMetaGraphBaseUrl()}/${accountId}/insights`)
  url.searchParams.set(
    'fields',
    'campaign_id,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,frequency,cost_per_action_type'
  )
  url.searchParams.set('level', 'campaign')
  url.searchParams.set('time_range', JSON.stringify({ since: opts.since, until: opts.until }))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Meta insights failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> }
  const rows: InsightRow[] = (json.data ?? []).map((r) => {
    const spend = Number(r.spend ?? 0)
    const leads = extractLeads(r)
    return {
      level: 'campaign',
      metaExternalId: String(r.campaign_id ?? ''),
      dateStart: opts.since,
      dateStop: opts.until,
      spend,
      impressions: Number(r.impressions ?? 0),
      reach: r.reach != null ? Number(r.reach) : null,
      clicks: Number(r.clicks ?? 0),
      ctr: r.ctr != null ? Number(r.ctr) : null,
      cpc: r.cpc != null ? Number(r.cpc) : null,
      cpm: r.cpm != null ? Number(r.cpm) : null,
      leads,
      costPerLead: leads > 0 ? spend / leads : null,
      frequency: r.frequency != null ? Number(r.frequency) : null,
      raw: r,
    }
  })
  return { label, rows }
}

function extractLeads(r: Record<string, unknown>): number {
  const actions = r.actions
  if (!Array.isArray(actions)) return 0
  for (const a of actions) {
    if (
      a &&
      typeof a === 'object' &&
      'action_type' in a &&
      (a as { action_type?: string }).action_type === 'lead' &&
      'value' in a
    ) {
      return Number((a as { value?: string | number }).value ?? 0)
    }
  }
  return 0
}

/** Idempotent upsert of insight snapshots. */
export async function persistInsightSnapshots(
  admin: SupabaseClient,
  organizationId: string,
  rows: InsightRow[],
  dataSource: 'meta' | 'mock'
): Promise<number> {
  let upserted = 0
  for (const row of rows) {
    if (!row.metaExternalId) continue
    const { error } = await admin.from('mbrain_performance_snapshots').upsert(
      {
        organization_id: organizationId,
        brand_id: row.brandId ?? null,
        level: row.level,
        internal_id: row.internalId ?? null,
        meta_external_id: row.metaExternalId,
        date_start: row.dateStart,
        date_stop: row.dateStop,
        spend: row.spend,
        impressions: row.impressions,
        reach: row.reach ?? null,
        cpm: row.cpm ?? null,
        clicks: row.clicks,
        ctr: row.ctr ?? null,
        cpc: row.cpc ?? null,
        landing_page_views: row.landingPageViews ?? null,
        leads: row.leads,
        cost_per_lead: row.costPerLead ?? null,
        frequency: row.frequency ?? null,
        raw: row.raw ?? {},
        data_source: dataSource,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,level,meta_external_id,date_start,date_stop' }
    )
    if (error) {
      mbrainLog('warn', 'insight_upsert_failed', { message: error.message })
    } else {
      upserted += 1
    }
  }
  return upserted
}

/** Deterministic KPI rollup from stored snapshots — never invent. */
export function rollupKpis(
  snapshots: Array<{
    spend: number | string
    leads: number | string
    impressions: number | string
    clicks: number | string
  }>
): {
  spend: number
  leads: number
  impressions: number
  clicks: number
  cpl: number | null
  ctr: number | null
  cpc: number | null
  conversionRate: number | null
} {
  const spend = snapshots.reduce((s, r) => s + Number(r.spend), 0)
  const leads = snapshots.reduce((s, r) => s + Number(r.leads), 0)
  const impressions = snapshots.reduce((s, r) => s + Number(r.impressions), 0)
  const clicks = snapshots.reduce((s, r) => s + Number(r.clicks), 0)
  return {
    spend,
    leads,
    impressions,
    clicks,
    cpl: leads > 0 ? spend / leads : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    conversionRate: clicks > 0 ? (leads / clicks) * 100 : null,
  }
}
