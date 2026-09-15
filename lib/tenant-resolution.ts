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
import { createProcessMemoryCache } from '@/lib/process-memory-cache'

const WHATSAPP_TENANT_CACHE_TTL_MS = 60_000

const whatsappTenantCache = createProcessMemoryCache<{
  clientId: string
  row: Record<string, unknown>
}>(WHATSAPP_TENANT_CACHE_TTL_MS)

/** Test hook — clear cached WhatsApp tenant rows. */
export function clearWhatsAppTenantCache(): void {
  whatsappTenantCache.clear()
}

/**
 * כל מזהי הלקוחות (clients.id) שמשתמש מחובר משויך אליהם.
 * auth.users → organization_users → organizations.client_id
 */
export async function listClientIdsForUserId(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: ouRows, error: ouErr } = await admin
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)

  // DB / network errors must throw — callers must not treat them as "no org"
  // (middleware used to signOut on empty list and wiped iOS PWA sessions).
  if (ouErr) {
    throw new Error(`ORG_USERS_QUERY_FAILED: ${ouErr.message}`)
  }
  if (!ouRows?.length) return []

  const orgIds = Array.from(
    new Set(
      ouRows
        .map((row) => (row as { organization_id?: string | null }).organization_id)
        .filter((id): id is string => Boolean(id && id.trim().length > 0))
    )
  )

  if (!orgIds.length) return []

  const { data: orgRows, error: orgErr } = await admin
    .from('organizations')
    .select('client_id')
    .in('id', orgIds)

  if (orgErr) {
    throw new Error(`ORGS_QUERY_FAILED: ${orgErr.message}`)
  }
  if (!orgRows?.length) return []

  const clientIds = new Set<string>()
  for (const row of orgRows as Array<{ client_id?: string | null }>) {
    const clientId = typeof row.client_id === 'string' ? row.client_id.trim() : ''
    if (clientId) clientIds.add(clientId)
  }

  return Array.from(clientIds)
}

/**
 * מזהה לקוח יחיד — נכשל (null) אם המשתמש משויך ליותר מלקוח אחד (מניעת דליפת tenant).
 */
export async function resolveClientIdForUserId(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const clientIds = await listClientIdsForUserId(admin, userId)
  if (clientIds.length === 0) return null
  if (clientIds.length > 1) {
    console.warn('[tenant-resolution] user linked to multiple clients — access denied', {
      userId,
      clientIds,
    })
    return null
  }
  return clientIds[0] ?? null
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
  const cacheKey = phoneNumberId.trim()
  if (cacheKey) {
    const cached = whatsappTenantCache.get(cacheKey)
    if (cached) return cached
  }

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
      if (one) {
        const resolved = { clientId: fallback, row: one as Record<string, unknown> }
        if (cacheKey) whatsappTenantCache.set(cacheKey, resolved)
        return resolved
      }
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
  const resolved = { clientId: id, row }
  if (cacheKey) whatsappTenantCache.set(cacheKey, resolved)
  return resolved
}
