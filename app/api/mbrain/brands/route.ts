import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { createBrandSchema } from '@/lib/mbrain/types'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('mbrain_brands')
    .select(
      'id, name, slug, website, status, market, locale, created_at, updated_at, mbrain_brand_profiles(product_description, target_customers, onboarding_completed_at, icps)'
    )
    .eq('organization_id', auth.ctx.organizationId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-brands')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = createBrandSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין', details: parsed.error.flatten() }, { status: 400 })
  }

  const { admin, organizationId, userId } = auth.ctx
  const { data: brand, error } = await admin
    .from('mbrain_brands')
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      website: parsed.data.website ?? null,
      market: parsed.data.market,
      locale: parsed.data.locale,
      status: 'draft',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('mbrain_brand_profiles').insert({
    organization_id: organizationId,
    brand_id: brand.id,
  })

  await writeMbrainAudit(admin, {
    organizationId,
    actorUserId: userId,
    action: 'brand.create',
    entityType: 'brand',
    entityId: brand.id,
    after: brand,
  })

  return NextResponse.json({ brand }, { status: 201 })
}
