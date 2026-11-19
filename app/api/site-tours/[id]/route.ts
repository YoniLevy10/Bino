import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { formatZodError } from '@/lib/errors/format-zod-error'
import { patchSiteTourManagerNotesBodySchema } from '@/lib/api-body-schemas'
import { sanitizeId } from '@/lib/api-validation'

type RouteCtx = { params: Promise<{ id: string }> }

/** Manager follow-up notes on a worker-logged site tour. */
export async function PATCH(req: Request, ctx: RouteCtx) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const { id: rawId } = await ctx.params
  const tourId = sanitizeId(rawId)
  if (!tourId) {
    return NextResponse.json({ error: 'מזהה סיור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'site-tour-manager-notes'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = patchSiteTourManagerNotesBodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const trimmed =
    validated.data.manager_notes == null
      ? null
      : validated.data.manager_notes.trim() || null

  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from('worker_site_tours')
    .update({
      manager_notes: trimmed,
      manager_notes_updated_at: nowIso,
    })
    .eq('id', tourId)
    .eq('client_id', auth.ctx.clientId)
    .select(
      'id, project_id, worker_id, completed_at, notes, manager_notes, manager_notes_updated_at, defect_ticket_id'
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'סיור לא נמצא' }, { status: 404 })
  }

  return NextResponse.json({ tour: data })
}

/** Manager permanently removes a worker-logged site tour (attachments cascade). */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const { id: rawId } = await ctx.params
  const tourId = sanitizeId(rawId)
  if (!tourId) {
    return NextResponse.json({ error: 'מזהה סיור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'site-tour-delete'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const { data, error } = await admin
    .from('worker_site_tours')
    .delete()
    .eq('id', tourId)
    .eq('client_id', auth.ctx.clientId)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'סיור לא נמצא' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
