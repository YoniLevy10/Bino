import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { BAMAKOR_OUTBOUND_SEQUENCES } from '@/lib/growth/outreach/sequences'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'
import { z } from 'zod'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const [{ data: sequences }, { data: enrollments }] = await Promise.all([
    auth.ctx.admin
      .from('growth_sequences')
      .select('*, growth_sequence_steps(*)')
      .eq('organization_id', auth.ctx.organizationId)
      .order('created_at', { ascending: false }),
    auth.ctx.admin
      .from('growth_sequence_enrollments')
      .select('*, growth_leads(id, score, score_band, status, growth_companies(name))')
      .eq('organization_id', auth.ctx.organizationId)
      .order('enrolled_at', { ascending: false })
      .limit(50),
  ])

  return NextResponse.json({
    sequences: sequences ?? [],
    enrollments: enrollments ?? [],
    templates: BAMAKOR_OUTBOUND_SEQUENCES,
  })
}

const seedSchema = z.object({ action: z.literal('seed_defaults') })

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'growth-sequences'
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
  const parsed = seedSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const created = []
  for (const tpl of BAMAKOR_OUTBOUND_SEQUENCES) {
    const { data: existing } = await auth.ctx.admin
      .from('growth_sequences')
      .select('id')
      .eq('organization_id', auth.ctx.organizationId)
      .eq('name', tpl.name)
      .maybeSingle()
    if (existing) continue

    const { data: seq, error } = await auth.ctx.admin
      .from('growth_sequences')
      .insert({
        organization_id: auth.ctx.organizationId,
        brand_id: BAMAKOR_BRAND_ID,
        name: tpl.name,
        channel: tpl.channel,
        status: 'active',
        description: tpl.description,
      })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const steps = tpl.steps.map((s) => ({
      sequence_id: seq.id,
      step_order: s.stepOrder,
      delay_days: s.delayDays,
      subject_template: s.subjectTemplate,
      body_template: s.bodyTemplate,
      angle: s.angle,
    }))
    await auth.ctx.admin.from('growth_sequence_steps').insert(steps)
    created.push(seq)
  }

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'growth.sequences.seed',
    entityType: 'growth_sequence',
    after: { count: created.length },
  })

  return NextResponse.json({ created }, { status: 201 })
}
