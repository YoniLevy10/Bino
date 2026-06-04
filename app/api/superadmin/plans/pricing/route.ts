import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminAuthorized } from '@/lib/superadmin-auth'
import { listAllPlanPricingAdmin, getBillingPlatformSettings } from '@/lib/plan-pricing'
import { z } from 'zod'

const patchPlanSchema = z.object({
  plan_tier: z.enum(['starter', 'pro', 'business', 'enterprise']),
  name_he: z.string().min(1).max(120).optional(),
  description_he: z.string().max(2000).nullable().optional(),
  price_ils_monthly: z.number().int().min(0).max(999_999).nullable().optional(),
  price_display_he: z.string().max(80).nullable().optional(),
  buildings_max: z.number().int().min(1).max(99_999).nullable().optional(),
  workers_max: z.number().int().min(1).max(99_999).nullable().optional(),
  tickets_per_month_max: z.number().int().min(1).max(9_999_999).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
})

const patchBodySchema = z.object({
  plans: z.array(patchPlanSchema).min(1).max(10).optional(),
  setup_fee_ils: z.number().int().min(0).max(9_999_999).optional(),
})

export async function GET(req: Request) {
  if (!isSuperAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const [catalog, settings] = await Promise.all([
      listAllPlanPricingAdmin(admin),
      getBillingPlatformSettings(admin),
    ])
    return NextResponse.json({ catalog, setup_fee_ils: settings.setup_fee_ils })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal' }, { status: 500 })
  }
}

/** Super Admin: update subscription tiers and global setup fee. */
export async function PATCH(req: Request) {
  if (!isSuperAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const updated: unknown[] = []

  if (parsed.data.setup_fee_ils != null) {
    const { error } = await admin
      .from('billing_platform_settings')
      .upsert(
        { id: 'default', setup_fee_ils: parsed.data.setup_fee_ils, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  for (const item of parsed.data.plans ?? []) {
    const { plan_tier, ...fields } = item
    const payload: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() }
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k]
    })

    const { data, error } = await admin
      .from('plan_pricing_catalog')
      .update(payload)
      .eq('plan_tier', plan_tier)
      .select(
        'plan_tier, name_he, description_he, price_ils_monthly, price_display_he, buildings_max, workers_max, tickets_per_month_max, sort_order, is_active'
      )
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message, plan_tier }, { status: 500 })
    }
    if (data) updated.push(data)
  }

  const [catalog, settings] = await Promise.all([
    listAllPlanPricingAdmin(admin),
    getBillingPlatformSettings(admin),
  ])

  return NextResponse.json({
    catalog: updated.length > 0 ? catalog : catalog,
    setup_fee_ils: settings.setup_fee_ils,
    updated,
  })
}
