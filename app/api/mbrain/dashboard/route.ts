import { NextResponse } from 'next/server'
import { requireMbrainSession } from '@/lib/mbrain/auth'
import { getMetaDataLabel, getMetaMode, getMetaGraphApiVersion } from '@/lib/mbrain/meta/client'
import { rollupKpis } from '@/lib/mbrain/meta/insights'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { admin, organizationId } = auth.ctx

  const [orgRes, brandsRes, guardrailsRes, hypothesesRes, approvalsRes, snapsRes, recsRes] =
    await Promise.all([
      admin.from('mbrain_organizations').select('*').eq('id', organizationId).single(),
      admin
        .from('mbrain_brands')
        .select('id, name, slug, website, status, market, locale, updated_at')
        .eq('organization_id', organizationId)
        .order('name'),
      admin.from('mbrain_spending_guardrails').select('*').eq('organization_id', organizationId),
      admin
        .from('mbrain_marketing_hypotheses')
        .select('id, brand_id, title, creative_angle, status, sort_order')
        .eq('organization_id', organizationId)
        .order('sort_order'),
      admin
        .from('mbrain_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'pending'),
      admin
        .from('mbrain_performance_snapshots')
        .select('spend, leads, impressions, clicks, data_source')
        .eq('organization_id', organizationId)
        .eq('level', 'campaign'),
      admin
        .from('mbrain_optimization_recommendations')
        .select('id, title, status')
        .eq('organization_id', organizationId)
        .eq('status', 'open')
        .limit(5),
    ])

  if (orgRes.error) {
    return NextResponse.json({ error: orgRes.error.message }, { status: 500 })
  }

  const snaps = snapsRes.data ?? []
  const hasSnaps = snaps.length > 0
  const rolled = hasSnaps ? rollupKpis(snaps) : null
  const anyMock = snaps.some((s) => s.data_source === 'mock')

  return NextResponse.json({
    organization: orgRes.data,
    brands: brandsRes.data ?? [],
    guardrails: guardrailsRes.data ?? [],
    hypotheses: hypothesesRes.data ?? [],
    meta: {
      mode: getMetaMode(),
      label: getMetaDataLabel(),
      graphApiVersion: getMetaGraphApiVersion(),
    },
    kpis: {
      spend: rolled?.spend ?? null,
      leads: rolled?.leads ?? null,
      cpl: rolled?.cpl ?? null,
      ctr: rolled?.ctr ?? null,
      cpc: rolled?.cpc ?? null,
      conversionRate: rolled?.conversionRate ?? null,
      dataSource: hasSnaps ? (anyMock ? 'mock' : 'meta') : 'none',
      noteHe: hasSnaps
        ? anyMock
          ? 'מוצגים snapshots (MOCK DATA) — לא נתוני Meta חיים.'
          : 'מדדים מ-performance_snapshots (LIVE META DATA).'
        : 'אין עדיין נתוני ביצועים מסונכרנים — לאחר חיבור Meta והשקה יוצגו מדדים אמיתיים.',
    },
    pendingApprovals: approvalsRes.count ?? 0,
    aiRecommendations: (recsRes.data ?? []).map((r) => ({ id: r.id, title: r.title })),
  })
}
