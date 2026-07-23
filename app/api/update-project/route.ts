import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { updateProjectBodySchema } from '@/lib/api-body-schemas'
import { sanitizeString } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `update-project-${Date.now()}`

  try {
    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'update-project')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => null)
    const validated = updateProjectBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { project_id, assigned_worker_id, ...fields } = validated.data

    const { data: existing, error: fetchErr } = await admin
      .from('projects')
      .select('id, name, project_code')
      .eq('id', project_id)
      .eq('client_id', clientId)
      .maybeSingle()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'פרויקט לא נמצא', requestId }, { status: 404 })
    }

    const payload: Record<string, unknown> = {}
    if (fields.name !== undefined) payload.name = sanitizeString(fields.name)
    if (fields.project_code !== undefined) payload.project_code = sanitizeString(fields.project_code).toUpperCase()
    if (fields.address !== undefined) payload.address = fields.address
    if (fields.address_en !== undefined) payload.address_en = fields.address_en
    if (fields.qr_identifier !== undefined) payload.qr_identifier = fields.qr_identifier
    if (fields.is_active !== undefined) payload.is_active = fields.is_active
    if (assigned_worker_id !== undefined) {
      payload.assigned_worker_id =
        assigned_worker_id === '' || assigned_worker_id === null ? null : assigned_worker_id
    }

    const { data: updated, error } = await admin
      .from('projects')
      .update(payload)
      .eq('id', project_id)
      .eq('client_id', clientId)
      .select('*')
      .single()

    if (error) {
      logger.error('PROJECT_API', 'Update project failed', new Error(error.message), { requestId, project_id })
      return NextResponse.json({ error: 'עדכון נכשל', requestId }, { status: 500 })
    }

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'UPDATE_PROJECT',
      entityType: 'project',
      entityId: project_id,
      newValues: payload,
    })

    return NextResponse.json({ success: true, data: updated, requestId })
  } catch (e) {
    logger.error('PROJECT_API', 'update-project error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
