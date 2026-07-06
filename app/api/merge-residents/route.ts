import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { mergeResidentsBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'
import { mergeResidentsForClient } from '@/lib/merge-residents'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `merge-residents-${Date.now()}`

  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'merge-residents')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => null)
    const validated = mergeResidentsBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: formatZodError(validated.error), requestId }, { status: 400 })
    }

    const { keep_resident_id, merge_resident_id } = validated.data
    const result = await mergeResidentsForClient({
      supabaseAdmin: admin,
      clientId,
      keepId: keep_resident_id,
      mergeId: merge_resident_id,
    })

    if (!result.ok) {
      logger.error('RESIDENT_API', 'merge-residents failed', new Error(result.error), {
        requestId,
        keep_resident_id,
        merge_resident_id,
      })
      return NextResponse.json({ error: result.error, requestId }, { status: result.status })
    }

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'MERGE_RESIDENT',
      entityType: 'resident',
      entityId: keep_resident_id,
      newValues: { merged_resident_id: merge_resident_id },
    })

    return NextResponse.json({ success: true, data: result.data, requestId })
  } catch (e) {
    logger.error(
      'RESIDENT_API',
      'merge-residents error',
      e instanceof Error ? e : new Error(String(e)),
      { requestId }
    )
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
