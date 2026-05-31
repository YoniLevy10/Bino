import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhatsAppTemplateKey } from '@/lib/whatsapp-template-keys'
import { WHATSAPP_TEMPLATE_EDITOR_DEFAULTS, SMS_TEMPLATE_VAR_NAMES, SMS_TEMPLATE_KEYS, WHATSAPP_TEMPLATE_KEYS } from '@/lib/whatsapp-template-keys'

const VAR_NAMES = ['project_name', 'ticket_number', 'description', 'reporter_name', 'building_line', 'list'] as const

const TEMPLATE_CACHE_TTL_MS = 60_000
const templateTextCache = new Map<string, { text: string; expiresAt: number }>()

/** החלפת משתני {{...}} בטקסט הודעת וואטסאפ */
export function interpolateWhatsAppTemplate(
  text: string,
  vars: Partial<Record<(typeof VAR_NAMES)[number], string>> = {}
): string {
  let out = text
  for (const name of VAR_NAMES) {
    const val = vars[name] ?? ''
    out = out.split(`{{${name}}}`).join(val)
  }
  return out
}

async function loadTemplateTextFromDb(
  admin: SupabaseClient,
  clientId: string,
  templateKey: WhatsAppTemplateKey
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('whatsapp_templates')
      .select('template_text')
      .eq('client_id', clientId)
      .eq('template_key', templateKey)
      .maybeSingle()

    if (error) {
      console.warn('[whatsapp_templates]', error.message)
    }

    const fromDb = (data as { template_text?: string } | null)?.template_text
    if (fromDb != null && String(fromDb).trim().length > 0) {
      return String(fromDb)
    }
    return null
  } catch (err) {
    console.warn('[whatsapp_templates] fetch failed, using default:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * טוען תבנית מ-whatsapp_templates לפי client_id + template_key.
 * אם אין שורה ב-DB — משתמש ב-fallbackText (הטקסט הקשיח מהקוד).
 * Cache בזיכרון ל־60 שניות לשורות שנמצאו ב־DB (מפחית round-trips בשליחות webhook).
 */
export async function resolveWhatsAppTemplateMessage(
  admin: SupabaseClient,
  clientId: string,
  templateKey: WhatsAppTemplateKey,
  fallbackText: string,
  vars: Partial<Record<(typeof VAR_NAMES)[number], string>> = {}
): Promise<string> {
  const cacheKey = `${clientId}:${templateKey}`
  const now = Date.now()
  const hit = templateTextCache.get(cacheKey)
  if (hit && hit.expiresAt > now) {
    return interpolateWhatsAppTemplate(hit.text, vars)
  }

  const fromDb = await loadTemplateTextFromDb(admin, clientId, templateKey)
  const raw = fromDb ?? fallbackText

  if (fromDb) {
    templateTextCache.set(cacheKey, { text: fromDb, expiresAt: now + TEMPLATE_CACHE_TTL_MS })
    setTimeout(() => {
      const cur = templateTextCache.get(cacheKey)
      if (cur && cur.expiresAt <= Date.now()) {
        templateTextCache.delete(cacheKey)
      }
    }, TEMPLATE_CACHE_TTL_MS + 50)
  }

  return interpolateWhatsAppTemplate(raw, vars)
}

/** החלפת משתני {{...}} בטקסט הודעת SMS */
export function interpolateSmsTemplate(
  text: string,
  vars: Partial<Record<(typeof SMS_TEMPLATE_VAR_NAMES)[number], string>> = {}
): string {
  let out = text
  for (const name of SMS_TEMPLATE_VAR_NAMES) {
    const val = vars[name] ?? ''
    out = out.split(`{{${name}}}`).join(val)
  }
  return out
}

/** טוען תבנית SMS מה-DB עם cache של 60 שניות. Falls back to defaultText. */
export async function resolveSmsTemplateMessage(
  admin: SupabaseClient,
  clientId: string,
  templateKey: string,
  fallbackText: string,
  vars: Partial<Record<(typeof SMS_TEMPLATE_VAR_NAMES)[number], string>> = {}
): Promise<string> {
  const cacheKey = `${clientId}:${templateKey}`
  const now = Date.now()
  const hit = templateTextCache.get(cacheKey)
  if (hit && hit.expiresAt > now) {
    return interpolateSmsTemplate(hit.text, vars)
  }

  try {
    const { data, error } = await admin
      .from('whatsapp_templates')
      .select('template_text')
      .eq('client_id', clientId)
      .eq('template_key', templateKey)
      .maybeSingle()

    if (error) console.warn('[sms_templates]', error.message)

    const fromDb = (data as { template_text?: string } | null)?.template_text
    if (fromDb && String(fromDb).trim()) {
      const text = String(fromDb)
      templateTextCache.set(cacheKey, { text, expiresAt: now + TEMPLATE_CACHE_TTL_MS })
      return interpolateSmsTemplate(text, vars)
    }
  } catch (err) {
    console.warn('[sms_templates] fetch failed, using default:', err instanceof Error ? err.message : String(err))
  }

  return interpolateSmsTemplate(fallbackText, vars)
}

/** Clear in-memory template cache after DB sync (webhook picks up new texts within 60s anyway). */
export function clearWhatsAppTemplateCache(clientId?: string): void {
  if (!clientId) {
    templateTextCache.clear()
    return
  }
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    templateTextCache.delete(`${clientId}:${key}`)
  }
  for (const key of SMS_TEMPLATE_KEYS) {
    templateTextCache.delete(`${clientId}:${key}`)
  }
}

/**
 * Smoke test helper: resolves the 5 core templates and prints to console.
 * Use from any server context (e.g. a one-off API route in dev).
 */
export async function smokeTestWhatsAppTemplates(
  admin: SupabaseClient,
  clientId: string
): Promise<void> {
  const vars = {
    project_name: 'מגדלי הים התיכון',
    ticket_number: '128',
    description: 'נזילה מהצנרת בחדר האמבטיה',
    reporter_name: 'ישראל ישראלי',
    building_line: '\nבניין: ב׳',
    list: '1. מגדלי הים התיכון\n2. בית הכרמל',
  }

  console.log('[whatsapp_templates][smoke] clientId', clientId)
  for (const key of Object.keys(WHATSAPP_TEMPLATE_EDITOR_DEFAULTS) as WhatsAppTemplateKey[]) {
    // eslint-disable-next-line no-await-in-loop
    const msg = await resolveWhatsAppTemplateMessage(admin, clientId, key, WHATSAPP_TEMPLATE_EDITOR_DEFAULTS[key], vars)
    console.log(`\n[whatsapp_templates][smoke] ${key}\n${msg}`)
  }
}
