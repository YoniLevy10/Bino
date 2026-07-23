import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteProjectBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { requireSessionMinRole } from '@/lib/api-auth'

/**
 * Delete a project: soft-delete tickets & residents (`deleted_at`);

 * clears merge pointers, then deletes sessions + project row.
 */
export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `delete-project-${Date.now()}`
  try {
    const auth = await requireSessionMinRole('admin')
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
      .select('id, name, project_code, client_id')
      .eq('id', projectId)
      .maybeSingle()

    if (pErr) {
      logger.error('PROJECT_API', 'Delete project lookup failed', new Error(pErr.message), { requestId, projectId, clientId })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }
    if (!project || (project as { client_id?: string }).client_id !== clientId) {
      audit.logFailedOperation('DELETE', 'PROJECT', projectId, clientId, 'project_not_found_or_wrong_tenant')
      return NextResponse.json({ error: 'פרויקט לא נמצא', requestId }, { status: 404 })
    }

    const { data: ticketRows, error: tListErr } = await admin
      .from('tickets')
      .select('id')
      .eq('project_id', projectId)

    if (tListErr) {
      logger.error('PROJECT_API', 'Delete project ticket list failed', new Error(tListErr.message), { requestId, projectId, clientId })
      return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }
    const ticketIds = ((ticketRows as { id: string }[] | null) || []).map((r) => r.id)

    if (ticketIds.length > 0) {
      const { error: mErr } = await admin
        .from('tickets')
        .update({ merged_into_ticket_id: null })
        .in('merged_into_ticket_id', ticketIds)
      if (mErr) return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })
    }

    const nowSoft = new Date().toISOString()
    const { error: softTicketsErr } = await admin
      .from('tickets')
      .update({ deleted_at: nowSoft, updated_at: nowSoft })
      .eq('project_id', projectId)
    if (softTicketsErr) return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })

    const { error: resDelErr } = await admin
      .from('residents')
      .update({ deleted_at: nowSoft })
      .eq('project_id', projectId)
    if (resDelErr) return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })

    const { error: sessDelErr } = await admin.from('sessions').delete().eq('project_id', projectId)
    if (sessDelErr) return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })

    const { error: delProjErr } = await admin.from('projects').delete().eq('id', projectId).eq('client_id', clientId)
    if (delProjErr) return NextResponse.json({ error: 'Server error', requestId }, { status: 500 })

    audit.logAction('DELETE', 'PROJECT', projectId, clientId, 'dashboard')
    logger.warn('PROJECT_API', 'Project hard-deleted', { requestId, projectId, clientId })
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
    console.error('[delete-project]', e)
    logger.error('PROJECT_API', 'Unhandled delete-project error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
