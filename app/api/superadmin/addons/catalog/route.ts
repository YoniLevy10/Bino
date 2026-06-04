import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listAllAddonsCatalogAdmin } from '@/lib/paid-addons'
import { z } from 'zod'

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}

const patchItemSchema = z.object({
  addon_key: z.string().min(1).max(64),
  name_he: z.string().min(1).max(200).optional(),
  description_he: z.string().max(2000).nullable().optional(),
  price_ils_monthly: z.number().int().min(0).max(999_999).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

const patchBodySchema = z.object({
  items: z.array(patchItemSchema).min(1).max(50),
})

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const catalog = await listAllAddonsCatalogAdmin(admin)
    return NextResponse.json({ catalog })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal' }, { status: 500 })
  }
}

/** Super Admin: update prices and labels for paid add-ons. */
export async function PATCH(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const updated: unknown[] = []

  for (const item of parsed.data.items) {
    const { addon_key, ...fields } = item
    const payload: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() }
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k]
    })

    const { data, error } = await admin
      .from('paid_addons_catalog')
      .update(payload)
      .eq('addon_key', addon_key)
      .select('addon_key, name_he, description_he, price_ils_monthly, is_active, sort_order')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message, addon_key }, { status: 500 })
    }
    if (data) updated.push(data)
  }

  return NextResponse.json({ catalog: updated })
}
