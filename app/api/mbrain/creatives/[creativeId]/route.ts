import { NextResponse } from 'next/server'
import { assertBrandInOrg, requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { z } from 'zod'

type Ctx = { params: Promise<{ creativeId: string }> }

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected', 'archived', 'draft', 'pending_review', 'in_campaign']),
})

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'mbrain-creative-patch')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { creativeId } = await ctx.params
  const { data: before } = await auth.ctx.admin
    .from('mbrain_creatives')
    .select('*')
    .eq('id', creativeId)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()

  if (!before) return NextResponse.json({ error: 'קריאייטיב לא נמצא' }, { status: 404 })

  const inOrg = await assertBrandInOrg(auth.ctx.admin, auth.ctx.organizationId, before.brand_id)
  if (!inOrg) return NextResponse.json({ error: 'אין גישה' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const { data: creative, error } = await auth.ctx.admin
    .from('mbrain_creatives')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', creativeId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: `creative.${parsed.data.status}`,
    entityType: 'creative',
    entityId: creativeId,
    before,
    after: creative,
  })

  return NextResponse.json({ creative })
}
