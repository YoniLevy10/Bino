import { NextResponse } from 'next/server'
import { requireMbrainSession } from '@/lib/mbrain/auth'
import { getMetaDataLabel, getMetaMode, getMetaGraphApiVersion } from '@/lib/mbrain/meta/client'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { admin, organizationId } = auth.ctx

  const [orgRes, brandsRes, guardrailsRes, hypothesesRes] = await Promise.all([
    admin.from('mbrain_organizations').select('*').eq('id', organizationId).single(),
    admin
      .from('mbrain_brands')
      .select('id, name, slug, website, status, market, locale, updated_at')
      .eq('organization_id', organizationId)
      .order('name'),
    admin
      .from('mbrain_spending_guardrails')
      .select('*')
      .eq('organization_id', organizationId),
    admin
      .from('mbrain_marketing_hypotheses')
      .select('id, brand_id, title, creative_angle, status, sort_order')
      .eq('organization_id', organizationId)
      .order('sort_order'),
  ])

  if (orgRes.error) {
    return NextResponse.json({ error: orgRes.error.message }, { status: 500 })
  }

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
      // Phase G fills from performance_snapshots — never invent metrics
      spend: null,
      leads: null,
      cpl: null,
      ctr: null,
      cpc: null,
      conversionRate: null,
      dataSource: 'none' as const,
      noteHe: 'אין עדיין נתוני ביצועים מסונכרנים — לאחר חיבור Meta והשקה יוצגו מדדים אמיתיים.',
    },
    pendingApprovals: 0,
    aiRecommendations: [] as Array<{ id: string; title: string }>,
  })
}
