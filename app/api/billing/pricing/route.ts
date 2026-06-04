import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { normalizeTier } from '@/lib/plan-limits'
import {
  getBillingPlatformSettings,
  getPlanPricingRow,
  listActivePlanPricing,
} from '@/lib/plan-pricing'

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const { admin, clientId } = auth.ctx

  try {
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('plan_tier')
      .eq('id', clientId)
      .maybeSingle()

    if (clientErr) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

    const planTier = normalizeTier((client as { plan_tier?: string } | null)?.plan_tier)

    const [catalog, currentPlan, settings] = await Promise.all([
      listActivePlanPricing(admin),
      getPlanPricingRow(admin, planTier),
      getBillingPlatformSettings(admin),
    ])

    return NextResponse.json({
      plan_tier: planTier,
      currentPlan,
      catalog,
      setup_fee_ils: settings.setup_fee_ils,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאת שרת' },
      { status: 500 }
    )
  }
}
