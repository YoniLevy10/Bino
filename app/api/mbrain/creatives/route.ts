import { NextResponse } from 'next/server'
import { assertBrandInOrg, requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { generateCopyForHypothesis } from '@/lib/mbrain/agents/copywriter'
import { getImageGenerationProvider } from '@/lib/mbrain/providers/image'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { z } from 'zod'

export async function GET(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const brandId = new URL(req.url).searchParams.get('brandId')
  let q = auth.ctx.admin
    .from('mbrain_creatives')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })
  if (brandId) q = q.eq('brand_id', brandId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    creatives: data ?? [],
    // Metrics join lands in Phase G — never invent
    metricsNote: 'Spend/CTR/CPL יופיעו לאחר סנכרון Insights',
  })
}

const generateSchema = z.object({
  brandId: z.string().uuid(),
  hypothesisId: z.string().uuid().optional(),
  formats: z.array(z.enum(['1:1', '4:5', '9:16'])).default(['1:1', '4:5']),
  strategyId: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-creatives-gen')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין', details: parsed.error.flatten() }, { status: 400 })
  }

  const ok = await assertBrandInOrg(auth.ctx.admin, auth.ctx.organizationId, parsed.data.brandId)
  if (!ok) return NextResponse.json({ error: 'מותג לא נמצא' }, { status: 404 })

  const { data: brand } = await auth.ctx.admin
    .from('mbrain_brands')
    .select('id, name')
    .eq('id', parsed.data.brandId)
    .single()

  let hypQuery = auth.ctx.admin
    .from('mbrain_marketing_hypotheses')
    .select('*')
    .eq('brand_id', parsed.data.brandId)
    .eq('organization_id', auth.ctx.organizationId)
    .order('sort_order')

  if (parsed.data.hypothesisId) {
    hypQuery = hypQuery.eq('id', parsed.data.hypothesisId)
  }

  const { data: hypotheses } = await hypQuery
  if (!hypotheses?.length) {
    return NextResponse.json({ error: 'אין השערות ליצירת קריאייטיב' }, { status: 400 })
  }

  const imageProvider = getImageGenerationProvider()
  const created: unknown[] = []

  for (const hyp of hypotheses.slice(0, 5)) {
    const copies = generateCopyForHypothesis({
      brandName: brand?.name ?? 'במקור',
      hypothesis: hyp,
    })
    const primary = copies[0]!

    for (const format of parsed.data.formats) {
      const image = await imageProvider.generate({
        prompt: primary.hook,
        aspectRatio: format,
        brandId: parsed.data.brandId,
        hypothesisId: hyp.id,
        headline: brand?.name ?? 'במקור',
        subheadline: primary.hook,
        cta: 'לתיאום הדגמה',
      })

      const { data: creative, error } = await auth.ctx.admin
        .from('mbrain_creatives')
        .insert({
          organization_id: auth.ctx.organizationId,
          brand_id: parsed.data.brandId,
          hypothesis_id: hyp.id,
          strategy_id: parsed.data.strategyId ?? null,
          status: 'pending_review',
          format,
          angle: primary.angle,
          hook: primary.hook,
          primary_text: primary.primaryText,
          headline: primary.headline,
          description: primary.description,
          cta: primary.cta,
          offer: primary.offer,
          target_pain: primary.targetPain,
          target_persona: primary.targetPersona,
          image_prompt: image.prompt,
          image_provider: image.provider,
          image_kind: image.kind,
          image_content: image.content,
        })
        .select('*')
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      await auth.ctx.admin.from('mbrain_creative_variations').insert(
        copies.map((c, i) => ({
          organization_id: auth.ctx.organizationId,
          creative_id: creative.id,
          variation_index: i + 1,
          primary_text: c.primaryText,
          headline: c.headline,
          description: c.description,
          hook: c.hook,
        }))
      )

      created.push(creative)
    }
  }

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'creatives.generate',
    entityType: 'creative',
    after: { count: created.length },
  })

  return NextResponse.json({ creatives: created, count: created.length }, { status: 201 })
}
