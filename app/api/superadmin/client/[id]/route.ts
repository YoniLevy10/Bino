import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/superadmin/superadmin-auth'
import { deleteClientCompletely } from '@/lib/delete-client'
import {
  getSetupPackageNavFeatures,
  normalizeEnabledNavFeaturesPayload,
} from '@/lib/client/client-nav-features'
import { SIDEBAR_NAV_ITEM_IDS } from '@/lib/sidebar-nav'
import { normalizePhone019 } from '@/lib/sms/sms-019-core'
import { normalizeGrowUserId } from '@/lib/payments/grow-credentials'

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  plan_tier: z.enum(['starter', 'pro', 'business', 'enterprise']).optional(),
  whatsapp_phone_number_id: z.string().max(100).nullable().optional(),
  whatsapp_business_phone: z.string().max(40).nullable().optional(),
  whatsapp_access_token: z.string().max(500).nullable().optional(),
  manager_phone: z.string().max(40).nullable().optional(),
  sms_sender_name: z.string().max(40).nullable().optional(),
  sms_on_ticket_open: z.boolean().optional(),
  sms_on_ticket_close: z.boolean().optional(),
  default_worker_phone: z.string().max(40).nullable().optional(),
  enabled_nav_features: z.array(z.enum(SIDEBAR_NAV_ITEM_IDS)).nullable().optional(),
  max_workers: z.number().int().min(1).max(99_999).nullable().optional(),
  buildings_allowed: z.number().int().min(1).max(99_999).nullable().optional(),
  max_tickets_per_month: z.number().int().min(1).max(999_999).nullable().optional(),
  grow_enabled: z.boolean().optional(),
  grow_user_id: z.string().max(80).nullable().optional(),
  grow_legal_business_name: z.string().max(120).nullable().optional(),
  grow_legal_phone: z.string().max(40).nullable().optional(),
  grow_legal_address: z.string().max(300).nullable().optional(),
  grow_legal_email: z.string().max(200).nullable().optional(),
  financy_enabled: z.boolean().optional(),
  financy_client_id: z.string().max(200).nullable().optional(),
  financy_client_secret: z.string().max(500).nullable().optional(),
  financy_user_id: z.string().max(200).nullable().optional(),
  palgate_enabled: z.boolean().optional(),
  palgate_device_id: z.string().max(120).nullable().optional(),
  palgate_phone_number: z.string().max(40).nullable().optional(),
  palgate_session_token_hex: z.string().max(128).nullable().optional(),
  palgate_token_type: z.string().max(40).nullable().optional(),
  palgate_base_url: z.string().max(200).nullable().optional(),
  ensure_parking_nav: z.boolean().optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('clients')
    .select(
      `
      id, name, plan_tier, whatsapp_phone_number_id, whatsapp_business_phone, manager_phone,
      sms_sender_name, sms_on_ticket_open, sms_on_ticket_close, default_worker_phone,
      enabled_nav_features, max_workers, buildings_allowed, max_tickets_per_month,
      grow_enabled, grow_user_id,
      grow_legal_business_name, grow_legal_phone, grow_legal_address, grow_legal_email,
      financy_enabled, financy_client_id, financy_user_id,
      palgate_enabled, palgate_device_id, palgate_phone_number, palgate_token_type, palgate_base_url,
      whatsapp_access_token, financy_client_secret, palgate_session_token_hex
    `
    )
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const row = data as Record<string, unknown>
  const tokenSet = Boolean(String(row.whatsapp_access_token || '').trim())
  const financySecretSet = Boolean(String(row.financy_client_secret || '').trim())
  const palgateTokenSet = Boolean(String(row.palgate_session_token_hex || '').trim())
  delete row.whatsapp_access_token
  delete row.financy_client_secret
  delete row.palgate_session_token_hex

  return NextResponse.json({
    client: {
      ...row,
      whatsapp_access_token_set: tokenSet,
      financy_client_secret_set: financySecretSet,
      palgate_session_token_set: palgateTokenSet,
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

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

  const d = parsed.data
  const payload: Record<string, unknown> = {}

  const copyKeys = [
    'name',
    'plan_tier',
    'whatsapp_phone_number_id',
    'whatsapp_business_phone',
    'whatsapp_access_token',
    'manager_phone',
    'sms_on_ticket_open',
    'sms_on_ticket_close',
    'default_worker_phone',
    'max_workers',
    'buildings_allowed',
    'max_tickets_per_month',
    'grow_enabled',
    'grow_legal_business_name',
    'grow_legal_phone',
    'grow_legal_address',
    'grow_legal_email',
    'financy_enabled',
    'financy_client_id',
    'financy_client_secret',
    'financy_user_id',
    'palgate_enabled',
    'palgate_device_id',
    'palgate_phone_number',
    'palgate_session_token_hex',
    'palgate_token_type',
    'palgate_base_url',
  ] as const

  for (const key of copyKeys) {
    if (d[key] !== undefined) payload[key] = d[key]
  }

  if (d.sms_sender_name !== undefined) {
    if (d.sms_sender_name == null || d.sms_sender_name.trim() === '') {
      payload.sms_sender_name = null
    } else {
      const normalized = normalizePhone019(d.sms_sender_name)
      if (!normalized) {
        return NextResponse.json(
          {
            error:
              'sms_sender_name must be an Israeli mobile (05… / 9725…). Alphanumeric brand names are rejected by 019SMS.',
          },
          { status: 400 }
        )
      }
      payload.sms_sender_name = normalized
    }
  }

  if (d.grow_user_id !== undefined) {
    payload.grow_user_id =
      d.grow_user_id == null || d.grow_user_id.trim() === ''
        ? null
        : normalizeGrowUserId(d.grow_user_id)
  }

  if (d.enabled_nav_features !== undefined) {
    if (d.enabled_nav_features === null) {
      payload.enabled_nav_features = null
    } else {
      const normalized = normalizeEnabledNavFeaturesPayload(d.enabled_nav_features)
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 })
      }
      payload.enabled_nav_features = normalized.value
    }
  }

  const hasExplicitLimitOverride =
    d.max_workers !== undefined ||
    d.buildings_allowed !== undefined ||
    d.max_tickets_per_month !== undefined

  if (d.plan_tier !== undefined && !hasExplicitLimitOverride) {
    payload.max_workers = null
    payload.buildings_allowed = null
    payload.max_tickets_per_month = null
  }

  const admin = getSupabaseAdmin()

  if (d.ensure_parking_nav === true || d.palgate_enabled === true) {
    const { data: current } = await admin
      .from('clients')
      .select('enabled_nav_features')
      .eq('id', id)
      .maybeSingle()
    const cur = (current as { enabled_nav_features?: string[] | null } | null)?.enabled_nav_features
    const base =
      payload.enabled_nav_features !== undefined
        ? (payload.enabled_nav_features as string[] | null)
        : cur
    if (Array.isArray(base)) {
      if (!base.includes('parking')) {
        payload.enabled_nav_features = [...base, 'parking']
      }
    } else if (base == null && d.palgate_enabled === true) {
      payload.enabled_nav_features = [...getSetupPackageNavFeatures(), 'parking']
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select(
      'id, name, plan_tier, whatsapp_phone_number_id, manager_phone, sms_sender_name, enabled_nav_features, max_workers, buildings_allowed, max_tickets_per_month, grow_enabled, grow_user_id, financy_enabled, palgate_enabled'
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  return NextResponse.json({ client: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

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
