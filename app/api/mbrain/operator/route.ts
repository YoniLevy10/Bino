import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { runOperatorCommand } from '@/lib/mbrain/agents/operator'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  brandId: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'mbrain-operator'
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
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const result = await runOperatorCommand({
    admin: auth.ctx.admin,
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    message: parsed.data.message,
    brandId: parsed.data.brandId,
  })

  return NextResponse.json(result)
}
