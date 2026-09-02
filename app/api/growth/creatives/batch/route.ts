import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import {
  generateBamakorCreativeBatch,
  measureDiversity,
} from '@/lib/growth/creative/hooks'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'

const FORMAT_MAP = {
  single_image: '1:1',
  carousel: '1:1',
  video_script: '9:16',
  story: '9:16',
} as const

export async function POST() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'growth-creative-batch'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const concepts = generateBamakorCreativeBatch()
  const diversity = measureDiversity(concepts)

  const rows = concepts.map((c) => ({
    organization_id: auth.ctx.organizationId,
    brand_id: BAMAKOR_BRAND_ID,
    status: 'draft',
    format: FORMAT_MAP[c.format],
    angle: c.angle,
    hook: c.hook,
    headline: c.headline,
    primary_text: c.primaryText,
    description: c.description,
    cta: c.cta,
    target_pain: c.pain,
    image_prompt: `${c.visualBrief} | tone:${c.tone} | concept:${c.id}`,
  }))

  const { data: creatives, error } = await auth.ctx.admin
    .from('mbrain_creatives')
    .insert(rows)
    .select('id, hook, headline, angle, status')

  if (error) {
    return NextResponse.json(
      {
        concepts,
        diversity: { score: diversity.score },
        persisted: false,
        warning: error.message,
      },
      { status: 200 }
    )
  }

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.creative.batch',
    entityType: 'mbrain_creative',
    after: { count: creatives?.length ?? 0, diversityScore: diversity.score },
  })

  return NextResponse.json({
    concepts,
    creatives,
    diversity: { score: diversity.score },
    persisted: true,
    noteHe: '6 קונספטים מגוונים — טיוטות בלבד, לא הושקו.',
  })
}

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const concepts = generateBamakorCreativeBatch()
  const diversity = measureDiversity(concepts)
  return NextResponse.json({ concepts, diversity: { score: diversity.score } })
}
