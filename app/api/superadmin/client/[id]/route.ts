import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import { deleteClientCompletely } from '@/lib/delete-client'
import { normalizeEnabledNavFeaturesPayload } from '@/lib/client-nav-features'
import { SIDEBAR_NAV_ITEM_IDS } from '@/lib/sidebar-nav'

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  plan_tier: z.enum(['starter', 'pro', 'business', 'enterprise']).optional(),
  whatsapp_phone_number_id: z.string().max(100).nullable().optional(),
  manager_phone: z.string().max(40).nullable().optional(),
  sms_sender_name: z.string().max(40).nullable().optional(),
  enabled_nav_features: z.array(z.enum(SIDEBAR_NAV_ITEM_IDS)).nullable().optional(),
})

const selectFields =
  'id, name, plan_tier, whatsapp_phone_number_id, manager_phone, sms_sender_name, enabled_nav_features'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.enabled_nav_features !== undefined) {
    if (parsed.data.enabled_nav_features === null) {
      payload.enabled_nav_features = null
    } else {
      const normalized = normalizeEnabledNavFeaturesPayload(parsed.data.enabled_nav_features)
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 })
      }
      payload.enabled_nav_features = normalized.value
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('clients').update(payload).eq('id', id).select(selectFields).maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  return NextResponse.json({ client: data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const { id } = await params
  const admin = getSupabaseAdmin()

  const { data: existing } = await admin.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const result = await deleteClientCompletely(admin, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted_id: id, deleted_name: existing.name })
}
