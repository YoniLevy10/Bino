import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchCampaignInsights, persistInsightSnapshots } from '@/lib/mbrain/meta/insights'
import { getMetaMode } from '@/lib/mbrain/meta/client'
import { mbrainLog } from '@/lib/mbrain/logging'

/**
 * Cron: sync Meta Insights → performance_snapshots (idempotent).
 * Auth: CRON_SECRET via Authorization Bearer or x-cron-secret (same as Bamakor crons).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const headerSecret = req.headers.get('x-cron-secret')
  const ok =
    secret &&
    (auth === `Bearer ${secret}` || headerSecret === secret || req.headers.get('authorization') === `Bearer ${secret}`)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const until = new Date()
  const since = new Date(until.getTime() - 24 * 60 * 60 * 1000)
  const sinceStr = since.toISOString().slice(0, 10)
  const untilStr = until.toISOString().slice(0, 10)

  const { data: orgs } = await admin.from('mbrain_organizations').select('id').eq('is_active', true)
  let total = 0

  for (const org of orgs ?? []) {
    const { data: account } = await admin
      .from('mbrain_meta_accounts')
      .select('ad_account_id, brand_id')
      .eq('organization_id', org.id)
      .eq('is_selected', true)
      .maybeSingle()
    if (!account) continue

    const { data: connection } = await admin
      .from('mbrain_meta_connections')
      .select('access_token_encrypted')
      .eq('organization_id', org.id)
      .maybeSingle()

    try {
      const { rows } = await fetchCampaignInsights({
        adAccountId: account.ad_account_id,
        accessToken: getMetaMode() === 'live' ? connection?.access_token_encrypted ?? null : null,
        since: sinceStr,
        until: untilStr,
      })
      const withBrand = rows.map((r) => ({ ...r, brandId: account.brand_id }))
      total += await persistInsightSnapshots(
        admin,
        org.id,
        withBrand,
        getMetaMode() === 'live' ? 'meta' : 'mock'
      )
    } catch (e) {
      mbrainLog('error', 'insights_cron_org_failed', {
        orgId: org.id,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({ ok: true, upserted: total, mode: getMetaMode(), range: { sinceStr, untilStr } })
}
