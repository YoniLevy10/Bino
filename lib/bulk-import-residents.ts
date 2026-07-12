import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  matchProjectName,
  normalizeProjectNameForMatch,
  type ParsedDirectoryResident,
} from '@/lib/parse-residents-directory-pdf'
import { normalizePhone } from '@/lib/residents-whatsapp'

export type BulkImportResidentsResult = {
  parsed: number
  matched_projects: number
  created_projects: string[]
  unmatched_projects: string[]
  skipped_duplicates: number
  purged_placeholders: number
  inserted: number
  project_summary: { pdf_name: string; db_name: string; rows: number; inserted: number }[]
}

type ProjectRow = { id: string; name: string; project_code?: string }

const HEBREW_SUFFIX: Record<string, string> = {
  א: 'A',
  ב: 'B',
  ג: 'G',
  ד: 'D',
  ה: 'H',
  ו: 'V',
  ז: 'Z',
  ח: 'H',
  ט: 'T',
  י: 'Y',
  כ: 'K',
  ל: 'L',
  מ: 'M',
  נ: 'N',
  ס: 'S',
  ע: 'O',
  פ: 'P',
  צ: 'TZ',
  ק: 'K',
  ר: 'R',
  ש: 'SH',
  ת: 'T',
}

/** Deterministic project_code for admin bulk import (A-Z0-9_, 2–20 chars). */
export function suggestProjectCodeForImport(pdfName: string, existingCodes: Set<string>): string {
  const norm = normalizeProjectNameForMatch(pdfName)
  const digits = (norm.match(/\d+/g) || []).join('')
  const letterMatch = norm.match(/([א-ת])$/u)
  const suffix = letterMatch ? HEBREW_SUFFIX[letterMatch[1]] || 'X' : ''
  const hash = createHash('sha256').update(norm).digest('hex').slice(0, 3).toUpperCase()

  let base = `BMK${digits}${suffix}${hash}`.replace(/[^A-Z0-9_]/g, '')
  if (base.length < 4) base = `BMK${hash}`.slice(0, 12)
  base = base.slice(0, 20)

  let candidate = base
  let n = 1
  while (existingCodes.has(candidate)) {
    const stem = base.slice(0, Math.max(2, 20 - String(n).length - 1))
    candidate = `${stem}_${n}`
    n++
  }
  existingCodes.add(candidate)
  return candidate
}

function formatPhoneForDb(raw: string): { phone: string | null; normalized: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { phone: null, normalized: null }
  const digits = normalizePhone(trimmed)
  if (!digits || digits.length < 9) return { phone: trimmed, normalized: null }
  return { phone: `+${digits}`, normalized: digits }
}

async function resolveOrganizationId(
  supabase: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

async function ensureProjectsForImport(
  supabase: SupabaseClient,
  params: {
    clientId: string
    pdfProjectNames: string[]
    projects: ProjectRow[]
    createMissingProjects: boolean
    dryRun: boolean
  }
): Promise<{ projects: ProjectRow[]; created: string[]; unmatched: string[] }> {
  const { clientId, pdfProjectNames, createMissingProjects, dryRun } = params
  const projects = [...params.projects]
  const created: string[] = []
  const unmatched: string[] = []

  const missing = pdfProjectNames.filter((name) => !matchProjectName(name, projects))
  if (missing.length === 0) return { projects, created, unmatched }

  if (!createMissingProjects) {
    return { projects, created, unmatched: missing }
  }

  const organizationId = await resolveOrganizationId(supabase, clientId)
  if (!organizationId) {
    throw new Error('No organization found for client — cannot create projects')
  }

  const { data: codeRows } = await supabase
    .from('projects')
    .select('project_code')
    .eq('client_id', clientId)

  const existingCodes = new Set(
    (codeRows || []).map((p) => String(p.project_code || '').toUpperCase()).filter(Boolean)
  )

  for (const pdfName of missing) {
    const projectCode = suggestProjectCodeForImport(pdfName, existingCodes)
    if (dryRun) {
      created.push(pdfName)
      projects.push({ id: `dry-run-${projectCode}`, name: pdfName, project_code: projectCode })
      continue
    }

    const { data: inserted, error } = await supabase
      .from('projects')
      .insert({
        client_id: clientId,
        organization_id: organizationId,
        name: pdfName,
        project_code: projectCode,
        qr_identifier: `START_${projectCode}`,
        is_active: true,
      })
      .select('id, name, project_code')
      .single()

    if (error || !inserted) {
      unmatched.push(pdfName)
      continue
    }

    projects.push(inserted)
    created.push(inserted.name)
  }

  return { projects, created, unmatched }
}

export async function bulkImportResidentsFromParsed(
  supabase: SupabaseClient,
  params: {
    clientId: string
    residents: ParsedDirectoryResident[]
    purgePlaceholders?: boolean
    createMissingProjects?: boolean
    dryRun?: boolean
  }
): Promise<BulkImportResidentsResult> {
  const {
    clientId,
    residents,
    purgePlaceholders = false,
    createMissingProjects = false,
    dryRun = false,
  } = params

  const { data: projectsData, error: pErr } = await supabase
    .from('projects')
    .select('id, name, project_code')
    .eq('client_id', clientId)
    .is('deleted_at', null)

  if (pErr || !projectsData) {
    throw new Error(pErr?.message || 'Failed to load projects')
  }

  const byProject = new Map<string, ParsedDirectoryResident[]>()
  for (const r of residents) {
    const list = byProject.get(r.project_name) || []
    list.push(r)
    byProject.set(r.project_name, list)
  }

  const ensured = await ensureProjectsForImport(supabase, {
    clientId,
    pdfProjectNames: [...byProject.keys()],
    projects: projectsData,
    createMissingProjects,
    dryRun,
  })

  const projects = ensured.projects
  const createdProjects = ensured.created
  const unmatched = [...ensured.unmatched]

  const toInsert: {
    project_id: string
    client_id: string
    full_name: string
    phone: string | null
    normalized_phone: string | null
    email: string | null
    is_renter: boolean
    apartment_number: string | null
    notes: string | null
  }[] = []
  const projectSummary: BulkImportResidentsResult['project_summary'] = []
  const matchedProjectIds = new Set<string>()

  for (const [pdfProject, rows] of byProject) {
    const match = matchProjectName(pdfProject, projects)
    if (!match) {
      if (!unmatched.includes(pdfProject)) unmatched.push(pdfProject)
      continue
    }
    matchedProjectIds.add(match.id)
    projectSummary.push({ pdf_name: pdfProject, db_name: match.name, rows: rows.length, inserted: 0 })

    for (const r of rows) {
      const { phone, normalized } = formatPhoneForDb(r.phone)
      toInsert.push({
        project_id: match.id,
        client_id: clientId,
        full_name: r.full_name,
        phone,
        normalized_phone: normalized,
        email: r.email || null,
        is_renter: r.is_renter,
        apartment_number: r.apartment_number || null,
        notes: r.notes || null,
      })
    }
  }

  let purgedPlaceholders = 0
  if (purgePlaceholders && matchedProjectIds.size > 0 && !dryRun) {
    const { data: placeholders } = await supabase
      .from('residents')
      .select('id')
      .eq('client_id', clientId)
      .in('project_id', [...matchedProjectIds])
      .is('deleted_at', null)
      .in('full_name', ['דייר ללא שם', 'דייר WhatsApp'])
      .or('phone.is.null,phone.eq.')

    const ids = (placeholders || []).map((r) => r.id)
    if (ids.length > 0) {
      const { error } = await supabase
        .from('residents')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw new Error(error.message)
      purgedPlaceholders = ids.length
    }
  }

  const { data: existing } = await supabase
    .from('residents')
    .select('project_id, normalized_phone, full_name, apartment_number')
    .eq('client_id', clientId)
    .is('deleted_at', null)

  const existingPhoneKeys = new Set(
    (existing || [])
      .filter((r) => r.normalized_phone)
      .map((r) => `${r.project_id}:${r.normalized_phone}`)
  )
  const existingNameAptKeys = new Set(
    (existing || []).map(
      (r) =>
        `${r.project_id}:${(r.apartment_number || '').trim().toLowerCase()}:${(r.full_name || '').trim().toLowerCase()}`
    )
  )

  const deduped = toInsert.filter((row) => {
    if (row.normalized_phone) {
      const key = `${row.project_id}:${row.normalized_phone}`
      if (existingPhoneKeys.has(key)) return false
      existingPhoneKeys.add(key)
      return true
    }
    const nameKey = `${row.project_id}:${(row.apartment_number || '').trim().toLowerCase()}:${row.full_name.trim().toLowerCase()}`
    if (existingNameAptKeys.has(nameKey)) return false
    existingNameAptKeys.add(nameKey)
    return true
  })

  const projectIdByName = new Map(projects.map((p) => [p.name, p.id]))

  for (const summary of projectSummary) {
    const pid = projectIdByName.get(summary.db_name)
    summary.inserted = deduped.filter((r) => r.project_id === pid).length
  }

  if (dryRun) {
    return {
      parsed: residents.length,
      matched_projects: projectSummary.length,
      created_projects: createdProjects,
      unmatched_projects: unmatched,
      skipped_duplicates: toInsert.length - deduped.length,
      purged_placeholders: 0,
      inserted: deduped.length,
      project_summary: projectSummary,
    }
  }

  const BATCH = 100
  let inserted = 0
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH)
    const { error } = await supabase.from('residents').insert(batch)
    if (error) throw new Error(error.message)
    inserted += batch.length
  }

  return {
    parsed: residents.length,
    matched_projects: projectSummary.length,
    created_projects: createdProjects,
    unmatched_projects: unmatched,
    skipped_duplicates: toInsert.length - deduped.length,
    purged_placeholders: purgedPlaceholders,
    inserted,
    project_summary: projectSummary,
  }
}
