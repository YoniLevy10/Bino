import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAuthenticatedPostRouteLimit, checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { formatZodError } from '@/lib/format-zod-error'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { normalizeGrowUserId } from '@/lib/grow-credentials'
import {
  assertProjectCanEnableGrow,
  findOtherUsingGrowUserId,
  listClientProjectGrowRows,
  loadProjectGrowRow,
  projectGrowAccountStatus,
  PROJECT_GROW_SELECT,
} from '@/lib/project-grow'
import { isGrowPlatformConfigured } from '@/lib/grow-config'

const patchSchema = z.object({
  project_id: z.string().uuid(),
  grow_enabled: z.boolean().optional(),
  grow_user_id: z.string().max(120).nullable().optional(),
})

/** List Grow status for all buildings of the tenant. */
export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(
    admin,
    auth.ctx.userId,
    'collections-project-grow'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim() || ''

  if (projectId) {
    const row = await loadProjectGrowRow(admin, auth.ctx.clientId, projectId)
    if (!row) {
      return NextResponse.json({ error: 'בניין לא נמצא' }, { status: 404 })
    }
    const status = projectGrowAccountStatus(row)
    return NextResponse.json({
      ok: true,
      platform_configured: isGrowPlatformConfigured(),
      project: row,
      status,
    })
  }

  const projects = await listClientProjectGrowRows(admin, auth.ctx.clientId)
  return NextResponse.json({
    ok: true,
    platform_configured: isGrowPlatformConfigured(),
    projects: projects.map((p) => ({
      ...p,
      status: projectGrowAccountStatus(p),
    })),
  })
}

/** Paste / enable Grow userId for one building. */
export async function PATCH(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections, { write: true })
  if (!auth.ok) return auth.response

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'collections-project-grow-patch'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = patchSchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const projectId = validated.data.project_id
  const existing = await loadProjectGrowRow(auth.ctx.admin, auth.ctx.clientId, projectId)
  if (!existing) {
    return NextResponse.json({ error: 'בניין לא נמצא' }, { status: 404 })
  }

  const nextUserId =
    validated.data.grow_user_id !== undefined
      ? normalizeGrowUserId(validated.data.grow_user_id)
      : normalizeGrowUserId(existing.grow_user_id)
  const nextEnabled =
    validated.data.grow_enabled !== undefined
      ? validated.data.grow_enabled
      : existing.grow_enabled === true

  const canEnable = assertProjectCanEnableGrow({ enabled: nextEnabled, userId: nextUserId })
  if (!canEnable.ok) {
    return NextResponse.json({ error: canEnable.error }, { status: 400 })
  }

  if (nextUserId) {
    const conflict = await findOtherUsingGrowUserId(auth.ctx.admin, nextUserId, {
      excludeProjectId: projectId,
    })
    if (conflict) {
      return NextResponse.json(
        {
          error: `מזהה Grow זה כבר משויך ל${conflict.kind === 'project' ? 'בניין' : 'לקוח'} אחר (${conflict.name || conflict.id}).`,
        },
        { status: 409 }
      )
    }
  }

  const patch: Record<string, unknown> = {}
  if (validated.data.grow_enabled !== undefined) patch.grow_enabled = validated.data.grow_enabled
  if (validated.data.grow_user_id !== undefined) {
    patch.grow_user_id = nextUserId
    if (nextUserId && nextEnabled) {
      patch.grow_onboarding_status = 'approved'
      patch.grow_onboarding_completed_at = new Date().toISOString()
    }
  }

  const { data, error } = await auth.ctx.admin
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .select(PROJECT_GROW_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'מזהה Grow או קוד מעקב כבר משויכים לבניין אחר.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    project: data,
    status: projectGrowAccountStatus(data as typeof existing),
  })
}
