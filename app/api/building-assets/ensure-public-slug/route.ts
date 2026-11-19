import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { z } from 'zod'
import {
  buildingAssetPublicUrl,
  generateBuildingAssetPublicSlug,
} from '@/lib/building-asset-public'

const bodySchema = z.object({
  asset_id: z.string().uuid(),
})

/** Ensure building_assets.public_slug exists (for QR sticker print). */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-assets-ensure-slug'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'asset_id חסר' }, { status: 400 })
  }

  const { data: row, error } = await admin
    .from('building_assets')
    .select('id, public_slug, name')
    .eq('id', parsed.data.asset_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'נכס לא נמצא' }, { status: 404 })

  if (row.public_slug) {
    return NextResponse.json({
      asset_id: row.id,
      public_slug: row.public_slug,
      url: buildingAssetPublicUrl(row.public_slug),
      created: false,
    })
  }

  let slug = generateBuildingAssetPublicSlug()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: updated, error: upErr } = await admin
      .from('building_assets')
      .update({ public_slug: slug, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .is('public_slug', null)
      .select('id, public_slug')
      .maybeSingle()

    if (!upErr && updated?.public_slug) {
      return NextResponse.json({
        asset_id: updated.id,
        public_slug: updated.public_slug,
        url: buildingAssetPublicUrl(updated.public_slug),
        created: true,
      })
    }

    // Unique collision or race — retry with new slug; re-read if another writer won.
    const { data: again } = await admin
      .from('building_assets')
      .select('id, public_slug')
      .eq('id', row.id)
      .maybeSingle()
    if (again?.public_slug) {
      return NextResponse.json({
        asset_id: again.id,
        public_slug: again.public_slug,
        url: buildingAssetPublicUrl(again.public_slug),
        created: false,
      })
    }
    slug = generateBuildingAssetPublicSlug()
  }

  return NextResponse.json({ error: 'יצירת קישור QR נכשלה' }, { status: 500 })
}
