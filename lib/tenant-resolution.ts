/**
 * lib/tenant-resolution.ts — פתרון multi-tenant: userId → clientId
 *
 * @description
 * שרשרת: auth.users → organization_users → organizations → clients.id
 * resolveClientIdForUserId() — מחזיר את client_id הראשון שנמצא.
 * requireClientIdForUser() — זורק שגיאה אם אין שיוך (לא הושלם onboarding).
 * getSingletonClientId() — cache קצר-מועד בזיכרון לאותו process (SSR).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * מזהה לקוח (clients.id) לפי משתמש מחובר:
 * auth.users → organization_users → organizations.client_id
 */
export async function resolveClientIdForUserId(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: ouRows, error: ouErr } = await admin
    .from('organization_users')
    .select('organization_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (ouErr || !ouRows?.length) return null

  const orgIds = Array.from(
    new Set(
      ouRows
        .map((row) => (row as { organization_id?: string | null }).organization_id)
        .filter((id): id is string => Boolean(id && id.trim().length > 0))
    )
  )

  if (!orgIds.length) return null

  const { data: orgRows, error: orgErr } = await admin
    .from('organizations')
    .select('id, client_id')
    .in('id', orgIds)

  if (orgErr || !orgRows?.length) return null

  const orgToClient = new Map<string, string>()
  for (const row of orgRows as Array<{ id?: string | null; client_id?: string | null }>) {
    const orgId = typeof row.id === 'string' ? row.id : ''
    const clientId = typeof row.client_id === 'string' ? row.client_id.trim() : ''
    if (orgId && clientId) {
      orgToClient.set(orgId, clientId)
    }
  }

  for (const row of ouRows as Array<{ organization_id?: string | null }>) {
    const orgId = typeof row.organization_id === 'string' ? row.organization_id : ''
    const clientId = orgToClient.get(orgId)
    if (clientId) return clientId
  }

  return null
}

/**
 * כמו resolveClientIdForUserId; אם אין — זורק (לשימוש ב-API עם משתמש מחובר).
 * BAMAKOR_CLIENT_ID — רק fallback ל-localhost / בדיקות.
 */
export async function requireClientIdForUser(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const cid = await resolveClientIdForUserId(admin, userId)
  if (cid) return cid

  const envOnly = (process.env.BAMAKOR_CLIENT_ID || '').trim()
  if (process.env.NODE_ENV === 'development' && envOnly) {
    return envOnly
  }

  throw new Error('NO_CLIENT_FOR_USER')
}

/**
 * Webhook וואטסאפ: לקוח לפי Meta phone_number_id (ייחודי לרוב לכל WABA).
 */
export async function resolveClientIdByWhatsAppPhoneNumberId(
  admin: SupabaseClient,
  phoneNumberId: string
): Promise<{ clientId: string; row: Record<string, unknown> } | null> {
  const { data: rows, error } = await admin
    .from('clients')
    .select('id, name, sms_sender_name, whatsapp_phone_number_id, whatsapp_access_token, manager_phone, default_worker_phone, sms_on_ticket_open, sms_on_ticket_close')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .limit(2)

  if (error || !rows?.length) {
    const fallback = (process.env.BAMAKOR_CLIENT_ID || '').trim()
    if (process.env.NODE_ENV === 'development' && fallback) {
      const { data: one } = await admin
        .from('clients')
        .select('id, name, sms_sender_name, whatsapp_phone_number_id, whatsapp_access_token, manager_phone, default_worker_phone, sms_on_ticket_open, sms_on_ticket_close')
        .eq('id', fallback)
        .maybeSingle()
      if (one) return { clientId: fallback, row: one as Record<string, unknown> }
    }
    return null
  }

  if (rows.length > 1) {
    console.warn('[tenant-resolution] multiple clients for whatsapp_phone_number_id', {
      phoneNumberId,
      count: rows.length,
    })
  }

  const row = rows[0] as Record<string, unknown>
  const id = row.id as string
  return { clientId: id, row }
}
