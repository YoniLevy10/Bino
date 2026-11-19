import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { buildingAssetCreateBodySchema } from '@/lib/api-body-schemas'
import { assertProjectOwnedByClient } from '@/lib/tenant-owned-refs'
import { generateBuildingAssetPublicSlug } from '@/lib/building-asset-public'

export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim()

  let q = admin
    .from('building_assets')
    .select('id, project_id, name, kind, notes, public_slug, created_at')
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .order('name')
    .limit(200)

  if (projectId) q = q.eq('project_id', projectId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data || [] })
}

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'building-assets')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = buildingAssetCreateBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const projectOk = await assertProjectOwnedByClient(
    admin,
    auth.ctx.clientId,
    parsed.data.project_id
  )
  if (!projectOk.ok) {
    return NextResponse.json({ error: projectOk.error }, { status: 400 })
  }

  const slug = generateBuildingAssetPublicSlug()
  const { data, error } = await admin
    .from('building_assets')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: parsed.data.project_id,
      name: parsed.data.name.trim(),
      kind: (parsed.data.kind || 'other').trim(),
      notes: parsed.data.notes?.trim() || null,
      public_slug: slug,
    })
    .select('id, project_id, name, kind, notes, public_slug, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset: data })
}
