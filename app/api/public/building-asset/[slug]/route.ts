import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isValidBuildingAssetSlug } from '@/lib/building-asset-public'
import { getLogger } from '@/lib/logging'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/**
 * Public asset QR landing data — name, building, recent tickets/tasks.
 * No PII beyond asset/building labels needed to open a linked ticket.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { slug: raw } = await ctx.params
  const slug = (raw || '').trim().toLowerCase()
  if (!isValidBuildingAssetSlug(slug)) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const ipFwd =
    (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const rl = await checkIpPostRouteLimit(admin, ipFwd, 'public-building-asset-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const { data: asset, error } = await admin
    .from('building_assets')
    .select('id, name, kind, notes, project_id, client_id, public_slug')
    .eq('public_slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    getLogger().error('ASSET_QR', 'public GET failed', new Error(error.message))
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
  if (!asset) {
    return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 })
  }

  const { data: project } = await admin
    .from('projects')
    .select('id, name, project_code, address')
    .eq('id', asset.project_id)
    .eq('client_id', asset.client_id)
    .maybeSingle()

  const [{ data: tickets }, { data: tasks }] = await Promise.all([
    admin
      .from('tickets')
      .select('id, ticket_number, description, status, created_at, closed_at')
      .eq('asset_id', asset.id)
      .eq('client_id', asset.client_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('maintenance_tasks')
      .select('id, title, status, due_at, completed_at, created_at')
      .eq('asset_id', asset.id)
      .eq('client_id', asset.client_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  return NextResponse.json({
    asset: {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      notes: asset.notes,
      public_slug: asset.public_slug,
    },
    project: project
      ? {
          id: project.id,
          name: project.name,
          project_code: project.project_code,
          address: project.address,
        }
      : null,
    client_id: asset.client_id,
    tickets: (tickets || []).map((t) => ({
      ticket_number: t.ticket_number,
      description: String(t.description || '').slice(0, 160),
      status: t.status,
      created_at: t.created_at,
      closed_at: t.closed_at,
    })),
    tasks: (tasks || []).map((t) => ({
      title: t.title,
      status: t.status,
      due_at: t.due_at,
      completed_at: t.completed_at,
      created_at: t.created_at,
    })),
  })
}
