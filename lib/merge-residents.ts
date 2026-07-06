import type { SupabaseClient } from '@supabase/supabase-js'
import { isWhatsAppPlaceholderResident, normalizePhone } from '@/lib/residents-whatsapp'

export type ResidentMergeRow = {
  id: string
  project_id: string
  client_id: string | null
  full_name: string
  phone: string | null
  normalized_phone: string | null
  email: string | null
  apartment_number: string | null
  notes: string | null
  is_renter: boolean
}

function normalizedDigits(row: ResidentMergeRow): string {
  if (row.normalized_phone) return row.normalized_phone
  if (row.phone) return normalizePhone(row.phone)
  return ''
}

export function residentsLookLikeSamePerson(a: ResidentMergeRow, b: ResidentMergeRow): boolean {
  const da = normalizedDigits(a)
  const db = normalizedDigits(b)
  if (da && db && da === db) return true
  const nameA = a.full_name.trim()
  const nameB = b.full_name.trim()
  return !!(nameA && nameB && nameA === nameB && a.project_id === b.project_id)
}

export function pickResidentToKeep(a: ResidentMergeRow, b: ResidentMergeRow): { keepId: string; mergeId: string } {
  const aPlaceholder = isWhatsAppPlaceholderResident(a)
  const bPlaceholder = isWhatsAppPlaceholderResident(b)
  if (aPlaceholder && !bPlaceholder) return { keepId: b.id, mergeId: a.id }
  if (bPlaceholder && !aPlaceholder) return { keepId: a.id, mergeId: b.id }

  const score = (r: ResidentMergeRow) =>
    (r.email ? 2 : 0) + (r.apartment_number ? 1 : 0) + (r.phone ? 1 : 0) + (r.notes ? 1 : 0)

  if (score(b) > score(a)) return { keepId: b.id, mergeId: a.id }
  return { keepId: a.id, mergeId: b.id }
}

function mergeField(keep: string | null, merge: string | null): string | null {
  const k = (keep || '').trim()
  const m = (merge || '').trim()
  return k || m || null
}

function mergeFullName(keep: ResidentMergeRow, merge: ResidentMergeRow): string {
  const keepName = keep.full_name.trim()
  const mergeName = merge.full_name.trim()
  if (!isWhatsAppPlaceholderResident({ full_name: keepName }) && keepName) return keepName
  if (!isWhatsAppPlaceholderResident({ full_name: mergeName }) && mergeName) return mergeName
  return keepName || mergeName
}

function mergeNotes(keep: string | null, merge: string | null): string | null {
  const a = (keep || '').trim()
  const b = (merge || '').trim()
  if (!a) return b || null
  if (!b || a.includes(b)) return a
  if (b.includes(a)) return b
  return `${a}\n${b}`.slice(0, 2000)
}

function mergedPhoneFields(keep: ResidentMergeRow, merge: ResidentMergeRow): {
  phone: string | null
  normalized_phone: string | null
} {
  const normalized = normalizedDigits(keep) || normalizedDigits(merge) || null
  const raw = keep.phone || merge.phone
  if (!normalized && !raw) return { phone: null, normalized_phone: null }
  const phone = raw?.startsWith('+') ? raw : normalized ? `+${normalized}` : raw
  return { phone: phone || null, normalized_phone: normalized }
}

export async function mergeResidentsForClient(params: {
  supabaseAdmin: SupabaseClient
  clientId: string
  keepId: string
  mergeId: string
}): Promise<{ ok: true; data: ResidentMergeRow } | { ok: false; status: number; error: string }> {
  const { supabaseAdmin, clientId, keepId, mergeId } = params
  if (keepId === mergeId) {
    return { ok: false, status: 400, error: 'לא ניתן לאחד דייר לעצמו' }
  }

  const { data: rows, error } = await supabaseAdmin
    .from('residents')
    .select(
      'id, project_id, client_id, full_name, phone, normalized_phone, email, apartment_number, notes, is_renter'
    )
    .eq('client_id', clientId)
    .in('id', [keepId, mergeId])
    .is('deleted_at', null)

  if (error || !rows || rows.length !== 2) {
    return { ok: false, status: 404, error: 'אחד הדיירים לא נמצא' }
  }

  const keep = rows.find((r) => r.id === keepId) as ResidentMergeRow | undefined
  const merge = rows.find((r) => r.id === mergeId) as ResidentMergeRow | undefined
  if (!keep || !merge) {
    return { ok: false, status: 404, error: 'אחד הדיירים לא נמצא' }
  }

  if (!residentsLookLikeSamePerson(keep, merge)) {
    return {
      ok: false,
      status: 400,
      error: 'ניתן לאחד רק דיירים עם אותו טלפון או אותו שם באותו בניין',
    }
  }

  const phoneFields = mergedPhoneFields(keep, merge)
  const now = new Date().toISOString()
  const payload = {
    full_name: mergeFullName(keep, merge),
    ...phoneFields,
    email: mergeField(keep.email, merge.email),
    apartment_number: mergeField(keep.apartment_number, merge.apartment_number),
    notes: mergeNotes(keep.notes, merge.notes),
    is_renter: keep.is_renter || merge.is_renter,
    updated_at: now,
  }

  await supabaseAdmin.from('whatsapp_conversations').update({ resident_id: keepId }).eq('resident_id', mergeId)
  await supabaseAdmin.from('collection_charges').update({ resident_id: keepId }).eq('resident_id', mergeId)

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('residents')
    .update(payload)
    .eq('id', keepId)
    .eq('client_id', clientId)
    .select('id, project_id, client_id, full_name, phone, email, is_renter, apartment_number, notes')
    .single()

  if (upErr || !updated) {
    return { ok: false, status: 500, error: 'עדכון דייר נכשל' }
  }

  const { error: delErr } = await supabaseAdmin
    .from('residents')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', mergeId)
    .eq('client_id', clientId)

  if (delErr) {
    return { ok: false, status: 500, error: 'מחיקת כפילות נכשלה' }
  }

  return { ok: true, data: updated as ResidentMergeRow }
}
