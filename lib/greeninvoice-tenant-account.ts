import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientGreenInvoiceRow } from '@/lib/greeninvoice-credentials'
import { isGreenInvoiceConfigured } from '@/lib/greeninvoice-credentials'

/** Checklist item for tenant Morning account setup (per-client — never shared). */
export type CollectionsAccountCheck = {
  id: 'enabled' | 'api_key' | 'api_secret' | 'clearing_documented'
  label: string
  ok: boolean
  required: boolean
}

export type CollectionsAccountStatus = {
  ready: boolean
  /** True when this client can create Morning payment forms with their own keys. */
  hasOwnAccount: boolean
  checks: CollectionsAccountCheck[]
  message: string
}

export function buildCollectionsAccountStatus(opts: {
  enabled: boolean
  apiKeyId: string | null | undefined
  apiSecretSet: boolean
  clearingPlugin: string | null | undefined
}): CollectionsAccountStatus {
  const keyOk = Boolean(opts.apiKeyId?.trim())
  const secretOk = opts.apiSecretSet
  const enabledOk = opts.enabled
  const clearingOk = Boolean(opts.clearingPlugin?.trim())

  const checks: CollectionsAccountCheck[] = [
    {
      id: 'enabled',
      label: 'חיבור Morning מופעל בחשבון שלכם',
      ok: enabledOk,
      required: true,
    },
    {
      id: 'api_key',
      label: 'מפתח API של החשבון האישי ב-Morning',
      ok: keyOk,
      required: true,
    },
    {
      id: 'api_secret',
      label: 'סוד API של החשבון האישי ב-Morning',
      ok: secretOk,
      required: true,
    },
    {
      id: 'clearing_documented',
      label: 'פלאגין סליקה מתועד (סליקה מוגדרת ב-Morning שלכם)',
      ok: clearingOk,
      required: false,
    },
  ]

  const hasOwnAccount = keyOk && secretOk
  const ready = enabledOk && hasOwnAccount

  let message = 'החשבון מוכן לגבייה — הכסף נכנס לחשבון Morning שלכם.'
  if (!hasOwnAccount) {
    message =
      'כל לקוח חייב מפתחות Morning משלו. אין חשבון משותף במקור — בלי זה אי אפשר לקבל תשלומים מדיירים.'
  } else if (!enabledOk) {
    message = 'המפתחות שמורים — הפעילו את החיבור כדי לשלוח חיובים.'
  }

  return { ready, hasOwnAccount, checks, message }
}

export function collectionsAccountStatusFromClientRow(
  row: ClientGreenInvoiceRow & { greeninvoice_api_secret?: string | null },
  apiSecretSet?: boolean
): CollectionsAccountStatus {
  const secretSet =
    apiSecretSet !== undefined
      ? apiSecretSet
      : Boolean(row.greeninvoice_api_secret?.trim())
  return buildCollectionsAccountStatus({
    enabled: row.greeninvoice_enabled === true,
    apiKeyId: row.greeninvoice_api_key_id,
    apiSecretSet: secretSet,
    clearingPlugin: row.greeninvoice_clearing_plugin,
  })
}

/**
 * Ensures Morning API Key ID is not reused across tenants.
 * Money settles into whichever Morning account owns the key — sharing would pool payments.
 */
export async function findOtherClientUsingMorningApiKey(
  admin: SupabaseClient,
  apiKeyId: string,
  excludeClientId: string
): Promise<{ id: string; name: string | null } | null> {
  const key = apiKeyId.trim()
  if (!key) return null

  const { data, error } = await admin
    .from('clients')
    .select('id, name')
    .eq('greeninvoice_api_key_id', key)
    .neq('id', excludeClientId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[morning-key-unique]', error.message)
    return null
  }
  return data ?? null
}

export function assertTenantCanEnableMorning(opts: {
  enabled: boolean
  apiKeyId: string | null | undefined
  hasSecret: boolean
}): { ok: true } | { ok: false; error: string } {
  if (!opts.enabled) return { ok: true }
  if (!opts.apiKeyId?.trim() || !opts.hasSecret) {
    return {
      ok: false,
      error:
        'לא ניתן להפעיל גבייה בלי מפתח וסוד API של חשבון Morning שלכם. כל לקוח חייב חשבון נפרד — אי אפשר לשתף כתובת/מפתחות.',
    }
  }
  return { ok: true }
}

export function isRowReadyForCollections(row: ClientGreenInvoiceRow): boolean {
  return isGreenInvoiceConfigured(row)
}
