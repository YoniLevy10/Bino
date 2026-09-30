import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteProjectBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { requireSessionWriteAccess } from '@/lib/api-auth'

/**
 * Soft-delete a project (audit #40): mark project + tickets + residents with deleted_at.
 * Never hard-delete the project row — CASCADE would wipe soft-deleted history.
 */
export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `delete-project-${Date.now()}`
  try {
    const auth = await requireSessionWriteAccess()
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'delete-project')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => ({}))
    const validated = deleteProjectBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }
    const { project_id: projectId } = validated.data

    const clientId = auth.ctx.clientId

    const { data: project, error: pErr } = await admin
      .from('projects')
      .select('id, name, project_code, client_id, deleted_at')
      .eq('id', projectId)
      .maybeSingle()

    if (pErr) {
      logger.error('PROJECT_API', 'Delete project lookup failed', new Error(pErr.message), {
        requestId,
        projectId,
        clientId,
      })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }
    if (!project || (project as { client_id?: string }).client_id !== clientId) {
      audit.logFailedOperation('DELETE', 'PROJECT', projectId, clientId, 'project_not_found_or_wrong_tenant')
      return NextResponse.json({ error: 'פרויקט לא נמצא', requestId }, { status: 404 })
    }
    if ((project as { deleted_at?: string | null }).deleted_at) {
      return NextResponse.json({
        success: true,
        requestId,
        already_deleted: true,
        deleted: {
          project_id: projectId,
          name: (project as { name?: string }).name,
          project_code: (project as { project_code?: string }).project_code,
        },
      })
    }

    const nowSoft = new Date().toISOString()

    const { error: softTicketsErr } = await admin
      .from('tickets')
      .update({ deleted_at: nowSoft, updated_at: nowSoft })
      .eq('project_id', projectId)
      .is('deleted_at', null)
    if (softTicketsErr) {
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const { error: resDelErr } = await admin
      .from('residents')
      .update({ deleted_at: nowSoft })
      .eq('project_id', projectId)
      .is('deleted_at', null)
    if (resDelErr) {
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const { error: sessDelErr } = await admin.from('sessions').delete().eq('project_id', projectId)
    if (sessDelErr) {
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const { error: softProjErr } = await admin
      .from('projects')
      .update({ deleted_at: nowSoft, is_active: false, updated_at: nowSoft })
      .eq('id', projectId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
    if (softProjErr) {
      // updated_at may not exist on older schemas — retry without it.
      const { error: softProjErr2 } = await admin
        .from('projects')
        .update({ deleted_at: nowSoft, is_active: false })
        .eq('id', projectId)
        .eq('client_id', clientId)
        .is('deleted_at', null)
      if (softProjErr2) {
        logger.error('PROJECT_API', 'Soft-delete project failed', new Error(softProjErr2.message), {
          requestId,
          projectId,
          clientId,
          firstError: softProjErr.message,
        })
        return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
      }
    }

    audit.logAction('DELETE', 'PROJECT', projectId, clientId, 'dashboard')
    logger.warn('PROJECT_API', 'Project soft-deleted', { requestId, projectId, clientId })
    return NextResponse.json({
      success: true,
      requestId,
      deleted: {
        project_id: projectId,
        name: (project as { name?: string }).name,
        project_code: (project as { project_code?: string }).project_code,
      },
    })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    logger.error('PROJECT_API', 'Delete project unexpected error', err, { requestId })
    return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
  }
}
