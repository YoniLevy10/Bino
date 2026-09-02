import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'
import { z } from 'zod'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('growth_learnings')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ learnings: data ?? [] })
}

const createSchema = z.object({
  category: z.enum(['icp', 'message', 'creative', 'channel', 'offer', 'other']),
  statement: z.string().min(5),
  confidence: z.number().min(0).max(1).default(0.5),
  status: z.enum(['hypothesis', 'validated', 'rejected']).default('hypothesis'),
  evidence: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'growth-learnings'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data, error } = await auth.ctx.admin
    .from('growth_learnings')
    .insert({
      organization_id: auth.ctx.organizationId,
      brand_id: BAMAKOR_BRAND_ID,
      category: parsed.data.category,
      statement: parsed.data.statement,
      confidence: parsed.data.confidence,
      status: parsed.data.status,
      evidence: parsed.data.evidence ?? {},
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.learning.create',
    entityType: 'growth_learning',
    entityId: data.id,
  })

  return NextResponse.json({ learning: data }, { status: 201 })
}
