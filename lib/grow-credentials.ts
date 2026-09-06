import type { SupabaseClient } from '@supabase/supabase-js'

export type ClientGrowPaymentsRow = {
  grow_enabled?: boolean | null
  grow_user_id?: string | null
}

export const CLIENT_GROW_PAYMENTS_SELECT = 'grow_enabled, grow_user_id'

export function normalizeGrowUserId(raw: string | null | undefined): string | null {
  const id = (raw || '').trim()
  return id || null
}

export function growUserIdFromRow(row: ClientGrowPaymentsRow): string | null {
  return normalizeGrowUserId(row.grow_user_id)
}

export function isGrowCollectionsConfigured(row: ClientGrowPaymentsRow): boolean {
  return row.grow_enabled === true && Boolean(growUserIdFromRow(row))
}

export type GrowCollectionsCheck = {
  id: 'platform' | 'enabled' | 'user_id'
  label: string
  ok: boolean
  required: boolean
}

export type GrowCollectionsAccountStatus = {
  ready: boolean
  hasOwnAccount: boolean
  checks: GrowCollectionsCheck[]
  message: string
}

export function buildGrowCollectionsAccountStatus(opts: {
  platformConfigured: boolean
  enabled: boolean
  userId: string | null | undefined
}): GrowCollectionsAccountStatus {
  const userOk = Boolean(opts.userId?.trim())
  const checks: GrowCollectionsCheck[] = [
    {
      id: 'platform',
      label: 'חיבור Bino ל-Grow (מפתחות מערכת בשרת)',
      ok: opts.platformConfigured,
      required: true,
    },
    {
      id: 'enabled',
      label: 'חיבור Grow מופעל בחשבון',
      ok: opts.enabled,
      required: true,
    },
    {
      id: 'user_id',
      label: 'מזהה לקוח Grow (userId) אחרי הצטרפות',
      ok: userOk,
      required: true,
    },
  ]
  const hasOwnAccount = userOk
  const ready = opts.platformConfigured && opts.enabled && userOk
  let message = 'החשבון מוכן לגבייה — הכסף נכנס לחשבון Grow שלכם.'
  if (!opts.platformConfigured) {
    message = 'חסרים מפתחות Grow של Bino בשרת (GROW_API_KEY / GROW_PAGE_CODE / GROW_WEBHOOK_SECRET).'
  } else if (!userOk) {
    message = 'פתחו חשבון ב-Grow והדביקו כאן את ה-userId שתקבלו.'
  } else if (!opts.enabled) {
    message = 'ה-userId שמור — הפעילו את החיבור כדי לשלוח חיובים.'
  }
  return { ready, hasOwnAccount, checks, message }
}

export function assertTenantCanEnableGrow(opts: {
  enabled: boolean
  userId: string | null | undefined
}): { ok: true } | { ok: false; error: string } {
  if (!opts.enabled) return { ok: true }
  if (!normalizeGrowUserId(opts.userId)) {
    return {
      ok: false,
      error: 'לא ניתן להפעיל גבייה בלי userId מ-Grow. פתחו חשבון אצלם והדביקו את המזהה.',
    }
  }
  return { ok: true }
}

/** Ensures Grow userId is not reused across tenants — money settles into that merchant. */
export async function findOtherClientUsingGrowUserId(
  admin: SupabaseClient,
  userId: string,
  excludeClientId: string
): Promise<{ id: string; name: string | null } | null> {
  const key = normalizeGrowUserId(userId)
  if (!key) return null

  const { data, error } = await admin
    .from('clients')
    .select('id, name')
    .eq('grow_user_id', key)
    .neq('id', excludeClientId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[grow-user-id-unique]', error.message)
    return null
  }
  return data ?? null
}
