import { NextResponse } from 'next/server'
import { assertBrandInOrg, requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { brandProfileUpdateSchema } from '@/lib/mbrain/types'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'

type Ctx = { params: Promise<{ brandId: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const { brandId } = await ctx.params

  const ok = await assertBrandInOrg(auth.ctx.admin, auth.ctx.organizationId, brandId)
  if (!ok) return NextResponse.json({ error: 'מותג לא נמצא' }, { status: 404 })

  const [brandRes, profileRes, hypothesesRes] = await Promise.all([
    auth.ctx.admin.from('mbrain_brands').select('*').eq('id', brandId).single(),
    auth.ctx.admin.from('mbrain_brand_profiles').select('*').eq('brand_id', brandId).maybeSingle(),
    auth.ctx.admin
      .from('mbrain_marketing_hypotheses')
      .select('*')
      .eq('brand_id', brandId)
      .order('sort_order'),
  ])

  if (brandRes.error) return NextResponse.json({ error: brandRes.error.message }, { status: 500 })

  return NextResponse.json({
    brand: brandRes.data,
    profile: profileRes.data,
    hypotheses: hypothesesRes.data ?? [],
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-brand-patch')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { brandId } = await ctx.params
  const ok = await assertBrandInOrg(auth.ctx.admin, auth.ctx.organizationId, brandId)
  if (!ok) return NextResponse.json({ error: 'מותג לא נמצא' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = brandProfileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: before } = await auth.ctx.admin
    .from('mbrain_brand_profiles')
    .select('*')
    .eq('brand_id', brandId)
    .maybeSingle()

  const { data: profile, error } = await auth.ctx.admin
    .from('mbrain_brand_profiles')
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq('brand_id', brandId)
    .eq('organization_id', auth.ctx.organizationId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'brand_profile.update',
    entityType: 'brand_profile',
    entityId: profile.id,
    before: before ?? null,
    after: profile,
  })

  return NextResponse.json({ profile })
}
