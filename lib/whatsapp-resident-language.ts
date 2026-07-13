import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeResidentLang, type ResidentLang } from '@/lib/whatsapp-bilingual-template'

async function readPendingLanguage(
  admin: SupabaseClient,
  clientId: string,
  phone: string
): Promise<string | null> {
  const { data } = await admin
    .from('pending_selections')
    .select('preferred_language, expires_at')
    .eq('phone_number', phone)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null
  const lang = (data as { preferred_language?: string | null }).preferred_language
  return lang?.trim() || null
}

async function readLastSessionLanguage(
  admin: SupabaseClient,
  clientId: string,
  phone: string
): Promise<string | null> {
  const { data } = await admin
    .from('sessions')
    .select('preferred_language')
    .eq('phone_number', phone)
    .eq('client_id', clientId)
    .not('preferred_language', 'is', null)
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lang = (data as { preferred_language?: string | null } | null)?.preferred_language
  return lang?.trim() || null
}

/** True when the resident explicitly chose (or inherited) a language — not merely the default. */
export async function hasExplicitResidentLanguage(
  admin: SupabaseClient,
  clientId: string,
  phone: string,
  activeSession?: { preferred_language?: string | null } | null
): Promise<boolean> {
  if (activeSession?.preferred_language?.trim()) return true
  if (await readPendingLanguage(admin, clientId, phone)) return true
  if (await readLastSessionLanguage(admin, clientId, phone)) return true
  return false
}

/** Resolved language for outbound messages — defaults to Hebrew when unset. */
export async function getResidentLanguage(
  admin: SupabaseClient,
  clientId: string,
  phone: string,
  activeSession?: { preferred_language?: string | null } | null
): Promise<ResidentLang> {
  if (activeSession?.preferred_language?.trim()) {
    return normalizeResidentLang(activeSession.preferred_language)
  }
  const pending = await readPendingLanguage(admin, clientId, phone)
  if (pending) return normalizeResidentLang(pending)
  const last = await readLastSessionLanguage(admin, clientId, phone)
  if (last) return normalizeResidentLang(last)
  return 'he'
}

export async function saveResidentLanguage(
  admin: SupabaseClient,
  clientId: string,
  phone: string,
  lang: ResidentLang,
  activeSessionId?: string | null
): Promise<void> {
  if (activeSessionId) {
    await admin
      .from('sessions')
      .update({ preferred_language: lang, last_activity_at: new Date().toISOString() })
      .eq('id', activeSessionId)
    return
  }

  const { data: existing } = await admin
    .from('pending_selections')
    .select('id')
    .eq('phone_number', phone)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    await admin.from('pending_selections').update({ preferred_language: lang }).eq('id', existing.id)
    return
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await admin.from('pending_selections').insert({
    phone_number: phone,
    client_id: clientId,
    candidate_projects: [],
    preferred_language: lang,
    expires_at: expiresAt,
  })
}

/** Copy stashed language from pending_selection into a new session row. */
export async function preferredLanguageForNewSession(
  admin: SupabaseClient,
  clientId: string,
  phone: string,
  fallback: ResidentLang = 'he'
): Promise<ResidentLang> {
  const pending = await readPendingLanguage(admin, clientId, phone)
  if (pending) return normalizeResidentLang(pending)
  const last = await readLastSessionLanguage(admin, clientId, phone)
  if (last) return normalizeResidentLang(last)
  return fallback
}
