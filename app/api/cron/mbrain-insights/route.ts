import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchCampaignInsights, persistInsightSnapshots, rollupKpis } from '@/lib/mbrain/meta/insights'
import { getMetaMode } from '@/lib/mbrain/meta/client'
import { getOrgMetaAccessToken } from '@/lib/mbrain/meta/token'
import { evaluateOptimizationRules } from '@/lib/mbrain/optimization-rules'
import { mbrainLog } from '@/lib/mbrain/logging'

/**
 * Cron: sync Meta Insights → snapshots + daily Hebrew optimization recommendations.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const headerSecret = req.headers.get('x-cron-secret')
  const ok =
    secret &&
    (auth === `Bearer ${secret}` || headerSecret === secret || auth === `Bearer ${secret}`)
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
  let recs = 0

  for (const org of orgs ?? []) {
    const { data: account } = await admin
      .from('mbrain_meta_accounts')
      .select('ad_account_id, brand_id')
      .eq('organization_id', org.id)
      .eq('is_selected', true)
      .maybeSingle()
    if (!account) continue

    try {
      const token = await getOrgMetaAccessToken(admin, org.id)
      const { rows } = await fetchCampaignInsights({
        adAccountId: account.ad_account_id,
        accessToken: token,
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

      const { data: snaps } = await admin
        .from('mbrain_performance_snapshots')
        .select('spend, leads, impressions, clicks, ctr, frequency')
        .eq('organization_id', org.id)
        .eq('level', 'campaign')
        .gte('date_start', sinceStr)

      const rolled = snaps?.length ? rollupKpis(snaps) : null
      const { data: guard } = await admin
        .from('mbrain_spending_guardrails')
        .select('max_cpl')
        .eq('organization_id', org.id)
        .eq('scope', 'organization')
        .maybeSingle()

      const hits = evaluateOptimizationRules({
        spend: rolled?.spend ?? 0,
        leads: rolled?.leads ?? 0,
        clicks: rolled?.clicks ?? 0,
        impressions: rolled?.impressions ?? 0,
        ctr: rolled?.ctr ?? null,
        frequency: snaps?.[0]?.frequency != null ? Number(snaps[0].frequency) : null,
        targetCpl: guard?.max_cpl != null ? Number(guard.max_cpl) : 150,
        minSpend: 50,
        minLeads: 3,
        cplMultiplier: 1.5,
      })

      for (const hit of hits) {
        if (hit.ruleCode === 'INSUFFICIENT_DATA' && (rolled?.spend ?? 0) === 0) continue
        const { data: existing } = await admin
          .from('mbrain_optimization_recommendations')
          .select('id')
          .eq('organization_id', org.id)
          .eq('rule_code', hit.ruleCode)
          .eq('status', 'open')
          .maybeSingle()
        if (existing) continue
        const { error } = await admin.from('mbrain_optimization_recommendations').insert({
          organization_id: org.id,
          brand_id: account.brand_id,
          rule_code: hit.ruleCode,
          severity: hit.severity,
          title: hit.title,
          explanation: hit.explanation,
          proposed_action: hit.proposedAction,
          requires_approval: hit.requiresApproval,
          status: 'open',
          metrics_snapshot: rolled ?? {},
        })
        if (!error) recs += 1
      }
    } catch (e) {
      mbrainLog('error', 'insights_cron_org_failed', {
        orgId: org.id,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    upserted: total,
    recommendations: recs,
    mode: getMetaMode(),
    range: { sinceStr, untilStr },
  })
}
