import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalesLeadSourceAdapter } from '@/lib/sales-leads/adapters/types'
import { assertSourceRecord } from '@/lib/sales-leads/adapters/types'
import {
  candidateFromSourceRecord,
  findDuplicate,
  type ExistingLeadLite,
} from '@/lib/sales-leads/dedupe'
import { normalizePhone } from '@/lib/sales-leads/phone'
import { mergeSourceRefs, normalizeWebsiteHost, pickWebsiteUrl } from '@/lib/sales-leads/source-refs'
import type {
  LeadStatus,
  SalesLead,
  SalesLeadSourceRecord,
} from '@/lib/sales-leads/types'
import { LEAD_STATUSES } from '@/lib/sales-leads/types'
import { notifyOpsBrainNewLead } from '@/lib/sales-leads/opsbrain-notify'
import {
  loadOperatorMap,
  rowToLead as funnelRowToLead,
  logWhatsappLinkOpened,
} from '@/lib/sales-leads/funnel/service'
import { jerusalemDayBounds } from '@/lib/sales-leads/funnel/timezone'
import type { OperatorActor } from '@/lib/sales-leads/operators'

export type IngestResult = {
  found: number
  created: number
  updated: number
  skipped: number
  errors: string[]
}

function rowToLead(row: Record<string, unknown>, operators?: Map<string, { id: string; displayName: string }>): SalesLead {
  return funnelRowToLead(row, operators)
}

/** Clears follow-up when lead leaves the active outreach funnel. */
const CLEAR_NEXT_CONTACT_STATUSES: ReadonlySet<LeadStatus> = new Set([
  'customer',
  'lost',
])

function plusDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

/** Ingest row: dedupe keys + fields previously re-fetched per duplicate. */
type IngestExistingRow = ExistingLeadLite & {
  status: string | null
  sourceRefs: SalesLead['sourceRefs']
  phone: string | null
  websiteUrl: string | null
  fitScore: number | null
}

const INGEST_UPDATE_CONCURRENCY = 10

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const idx = next
      next += 1
      await fn(items[idx]!)
    }
  })
  await Promise.all(workers)
}

/**
 * loadExistingLite pulls up to 8k rows for in-memory dedupe — fine through ~1–5k leads.
 * Revisit DB-level upsert / indexed lookups before ~10k+ (see CLAUDE.md).
 * Includes status/source_refs/phone/fit so ingest can skip per-duplicate SELECTs.
 */
async function loadExistingLite(admin: SupabaseClient): Promise<IngestExistingRow[]> {
  const { data, error } = await admin
    .from('sales_leads')
    .select(
      'id, phone_normalized, source_name, external_id, business_name, segment_slug, city, website_url, source_url, status, source_refs, phone, fit_score',
    )
    .limit(8000)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    phoneNormalized: (r.phone_normalized as string | null) ?? null,
    sourceName: String(r.source_name),
    externalId: (r.external_id as string | null) ?? null,
    businessName: (r.business_name as string | null) ?? null,
    segmentSlug: String(r.segment_slug ?? 'building_mgmt'),
    city: String(r.city),
    websiteHost: normalizeWebsiteHost(
      (r.website_url as string | null) ?? (r.source_url as string | null),
    ),
    status: (r.status as string | null) ?? null,
    sourceRefs: Array.isArray(r.source_refs)
      ? (r.source_refs as SalesLead['sourceRefs'])
      : [],
    phone: (r.phone as string | null) ?? null,
    websiteUrl: (r.website_url as string | null) ?? null,
    fitScore: typeof r.fit_score === 'number' ? r.fit_score : r.fit_score != null ? Number(r.fit_score) : null,
  }))
}

export async function ingestFromAdapter(
  admin: SupabaseClient,
  adapter: SalesLeadSourceAdapter,
): Promise<IngestResult> {
  const result: IngestResult = {
    found: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  let records: SalesLeadSourceRecord[] = []
  try {
    records = await adapter.fetchRecords()
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'adapter fetch failed')
    return result
  }

  result.found = records.length
  const existing = await loadExistingLite(admin)
  const now = new Date().toISOString()
  const pendingUpdates: Array<{ id: string; patch: Record<string, unknown> }> = []

  for (const record of records) {
    const check = assertSourceRecord(record)
    if (!check.ok) {
      result.skipped += 1
      result.errors.push(check.error)
      continue
    }

    const candidate = candidateFromSourceRecord(record)
    const dup = findDuplicate(candidate, existing)
    const website = pickWebsiteUrl(record.websiteUrl, record.sourceUrl)
    const phoneNormalized = normalizePhone(record.phone ?? record.whatsappPhone)
    const sourceRef = {
      source: record.sourceName,
      externalId: record.externalId ?? null,
      url: record.sourceUrl ?? null,
      seenAt: now,
    }

    if (dup) {
      const current = existing.find((e) => e.id === dup.existingId)
      if (!current) {
        result.skipped += 1
        continue
      }

      const protectedStatus = ['customer', 'lost', 'demo_scheduled', 'demo_done', 'proposal_sent', 'negotiation'].includes(
        String(current.status),
      )
      const patch: Record<string, unknown> = {
        last_seen_at: now,
        source_refs: mergeSourceRefs(current.sourceRefs ?? [], sourceRef),
      }
      if (!protectedStatus) {
        if (record.phone && !current.phone) patch.phone = record.phone
        if (website && !current.websiteUrl) patch.website_url = website
        if (
          typeof record.fitScore === 'number' &&
          (current.fitScore == null || record.fitScore > Number(current.fitScore))
        ) {
          patch.fit_score = record.fitScore
          patch.fit_class = record.fitClass
          patch.fit_confidence = record.fitConfidence
          patch.fit_reasons = record.fitReasons ?? []
        }
        if (record.outreachAngle) patch.outreach_angle = record.outreachAngle
        if (record.estimatedMrrIls != null) patch.estimated_mrr_ils = record.estimatedMrrIls
      }

      // Keep in-memory index warm for later duplicates in the same run.
      current.sourceRefs = patch.source_refs as SalesLead['sourceRefs']
      if (typeof patch.phone === 'string') current.phone = patch.phone
      if (typeof patch.website_url === 'string') {
        current.websiteUrl = patch.website_url
        current.websiteHost = normalizeWebsiteHost(patch.website_url)
      }
      if (typeof patch.fit_score === 'number') current.fitScore = patch.fit_score

      pendingUpdates.push({ id: dup.existingId, patch })
      continue
    }

    const insertRow = {
      name: record.name.trim(),
      business_name: record.businessName ?? record.name,
      phone: record.phone ?? null,
      whatsapp_phone: record.whatsappPhone ?? null,
      phone_normalized: phoneNormalized,
      email: record.email ?? null,
      city: record.city,
      search_city: record.searchCity ?? record.city,
      business_address: record.businessAddress ?? null,
      segment_slug: record.segmentSlug ?? 'building_mgmt',
      source_name: record.sourceName,
      source_url: record.sourceUrl ?? null,
      website_url: website,
      external_id: record.externalId ?? null,
      status: 'new',
      interest_level: 'unknown',
      version: 1,
      fit_score: record.fitScore ?? null,
      fit_class: record.fitClass ?? null,
      fit_confidence: record.fitConfidence ?? null,
      fit_reasons: record.fitReasons ?? [],
      contactability: record.contactability ?? null,
      estimated_buildings: record.estimatedBuildings ?? null,
      estimated_mrr_ils: record.estimatedMrrIls ?? null,
      outreach_angle: record.outreachAngle ?? null,
      notes: record.notes ?? null,
      enrichment: {
        placeTypes: record.placeTypes ?? [],
        queryKey: record.queryKey ?? null,
        rating: record.rating ?? null,
        reviewCount: record.reviewCount ?? null,
        openingHours: record.openingHours ?? null,
      },
      source_refs: [sourceRef],
      last_seen_at: now,
    }

    const { data: created, error } = await admin
      .from('sales_leads')
      .insert(insertRow)
      .select('id, phone_normalized, source_name, external_id, business_name, segment_slug, city, website_url')
      .maybeSingle()

    if (error || !created) {
      result.errors.push(error?.message ?? 'insert failed')
      result.skipped += 1
      continue
    }

    existing.push({
      id: created.id as string,
      phoneNormalized: (created.phone_normalized as string | null) ?? null,
      sourceName: String(created.source_name),
      externalId: (created.external_id as string | null) ?? null,
      businessName: (created.business_name as string | null) ?? null,
      segmentSlug: String(created.segment_slug),
      city: String(created.city),
      websiteHost: normalizeWebsiteHost(created.website_url as string | null),
      status: 'new',
      sourceRefs: [sourceRef],
      phone: record.phone ?? null,
      websiteUrl: website,
      fitScore: record.fitScore ?? null,
    })
    result.created += 1

    await admin.from('sales_lead_events').insert({
      lead_id: created.id,
      actor: 'discovery',
      action: 'discovered',
      to_status: 'new',
      payload: { source: record.sourceName, segment: record.segmentSlug },
    })

    void notifyOpsBrainNewLead({
      id: String(created.id),
      name: record.name.trim(),
      phone: record.phone ?? record.whatsappPhone ?? null,
      email: record.email ?? null,
      businessName: record.businessName ?? record.name,
      notes: record.notes ?? null,
      city: record.city,
    })
  }

  await mapPool(pendingUpdates, INGEST_UPDATE_CONCURRENCY, async ({ id, patch }) => {
    const { error } = await admin.from('sales_leads').update(patch).eq('id', id)
    if (error) {
      result.errors.push(error.message)
      result.skipped += 1
    } else {
      result.updated += 1
    }
  })

  return result
}

export async function listSalesLeads(
  admin: SupabaseClient,
  filters: {
    q?: string
    status?: LeadStatus | LeadStatus[]
    fitClass?: string | string[]
    city?: string
    segmentSlug?: string
    contactability?: string | string[]
    minFitScore?: number
    dueToday?: boolean
    sort?: 'fit_score' | 'created_at' | 'estimated_mrr' | 'next_contact'
    limit?: number
    offset?: number
  } = {},
): Promise<{ leads: SalesLead[]; total: number }> {
  const limit = Math.min(filters.limit ?? 50, 200)
  const offset = filters.offset ?? 0
  const sort = filters.sort ?? 'fit_score'
  const dayBounds = jerusalemDayBounds()
  const sortColumn =
    sort === 'created_at'
      ? 'created_at'
      : sort === 'estimated_mrr'
        ? 'estimated_mrr_ils'
        : sort === 'next_contact'
          ? 'next_action_at'
          : 'fit_score'

  let query = admin
    .from('sales_leads')
    .select('*', { count: 'exact' })
    .order(sortColumn, { ascending: sort === 'next_contact', nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (filters.city) query = query.eq('city', filters.city)
  if (filters.segmentSlug) query = query.eq('segment_slug', filters.segmentSlug)
  if (filters.contactability) {
    const vals = (
      Array.isArray(filters.contactability) ? filters.contactability : [filters.contactability]
    )
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter(Boolean)
    if (vals.length) query = query.in('contactability', vals)
  }
  if (filters.fitClass) {
    const classes = (Array.isArray(filters.fitClass) ? filters.fitClass : [filters.fitClass])
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter(Boolean)
    if (classes.length) query = query.in('fit_class', classes)
  }
  if (filters.status) {
    const statuses = (Array.isArray(filters.status) ? filters.status : [filters.status])
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter(Boolean)
    if (statuses.length) query = query.in('status', statuses)
  }
  if (filters.minFitScore != null && Number.isFinite(filters.minFitScore)) {
    query = query.gte('fit_score', filters.minFitScore)
  }
  if (filters.dueToday) {
    query = query
      .lte('next_action_at', dayBounds.dayEndIso)
      .gte('next_action_at', dayBounds.dayStartIso)
      .not('next_action_at', 'is', null)
      .in('status', [
        'new',
        'contact_attempt',
        'conversation_held',
        'demo_scheduled',
        'demo_done',
        'proposal_sent',
        'negotiation',
        'deferred',
      ])
  }
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`
    query = query.or(
      `name.ilike.${q},business_name.ilike.${q},phone.ilike.${q},notes.ilike.${q}`,
    )
  }

  const { data, error, count } = await query
  if (error) throw error
  const operators = await loadOperatorMap(admin)
  return {
    leads: (data ?? []).map((r) => rowToLead(r as Record<string, unknown>, operators)),
    total: count ?? 0,
  }
}

export async function getLeadCounters(admin: SupabaseClient) {
  const { data } = await admin
    .from('sales_leads')
    .select(
      'status, fit_class, city, segment_slug, estimated_mrr_ils, next_action_at, next_contact_at, phone, whatsapp_phone, email, contactability, interest_level',
    )
    .limit(10000)

  const rows = data ?? []
  const byStatus: Record<string, number> = {}
  const byFitClass: Record<string, number> = {}
  const byCity = new Map<string, number>()
  const bySegment = new Map<string, number>()
  let pipelineMrr = 0
  let dueToday = 0
  let withContactChannel = 0
  const dayBounds = jerusalemDayBounds()

  for (const r of rows) {
    const st = String(r.status)
    byStatus[st] = (byStatus[st] ?? 0) + 1
    const fc = String(r.fit_class ?? 'unknown')
    byFitClass[fc] = (byFitClass[fc] ?? 0) + 1
    const city = String(r.city || '—')
    byCity.set(city, (byCity.get(city) ?? 0) + 1)
    const seg = String(r.segment_slug || '—')
    bySegment.set(seg, (bySegment.get(seg) ?? 0) + 1)
    if (
      [
        'new',
        'contact_attempt',
        'conversation_held',
        'demo_scheduled',
        'demo_done',
        'proposal_sent',
        'negotiation',
      ].includes(st)
    ) {
      pipelineMrr += Number(r.estimated_mrr_ils ?? 0)
    }
    const nextAt =
      (r.next_action_at as string | null) ?? (r.next_contact_at as string | null)
    if (
      nextAt &&
      nextAt >= dayBounds.dayStartIso &&
      nextAt <= dayBounds.dayEndIso &&
      ![
        'customer',
        'lost',
      ].includes(st)
    ) {
      dueToday += 1
    }
    if (r.phone || r.whatsapp_phone || r.email || r.contactability === 'mobile') {
      withContactChannel += 1
    }
  }

  return {
    total: rows.length,
    dueToday,
    withContactChannel,
    contactChannelPct: rows.length ? Math.round((withContactChannel / rows.length) * 100) : 0,
    byStatus,
    byFitClass,
    byCity: [...byCity.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    bySegment: [...bySegment.entries()]
      .map(([segmentSlug, count]) => ({ segmentSlug, count }))
      .sort((a, b) => b.count - a.count),
    pipelineMrrIls: pipelineMrr,
    targetMrrIls: 100_000,
  }
}

export async function updateLeadStatus(
  admin: SupabaseClient,
  leadId: string,
  status: LeadStatus,
  actor = 'superadmin',
): Promise<SalesLead> {
  if (!LEAD_STATUSES.includes(status)) throw new Error('invalid status')

  const { data: current, error: curErr } = await admin
    .from('sales_leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()
  if (curErr || !current) throw new Error(curErr?.message ?? 'lead not found')

  const patch: Record<string, unknown> = {
    status,
    version: Number(current.version ?? 1) + 1,
  }
  if (status === 'contact_attempt' && !current.contacted_at) {
    patch.contacted_at = new Date().toISOString()
  }
  if (status === 'contact_attempt' && !current.next_action_at && !current.next_contact_at) {
    const due = plusDaysIso(3)
    patch.next_contact_at = due
    patch.next_action_at = due
    patch.next_action_title = patch.next_action_title ?? 'מעקב'
  }
  if (CLEAR_NEXT_CONTACT_STATUSES.has(status)) {
    patch.next_contact_at = null
    patch.next_action_at = null
    patch.next_action_title = null
  }

  const { data: updated, error } = await admin
    .from('sales_leads')
    .update(patch)
    .eq('id', leadId)
    .select('*')
    .maybeSingle()
  if (error || !updated) throw new Error(error?.message ?? 'update failed')

  await admin.from('sales_lead_events').insert({
    lead_id: leadId,
    actor,
    action: 'status_change',
    from_status: current.status,
    to_status: status,
    payload: {},
  })

  const operators = await loadOperatorMap(admin)
  return rowToLead(updated as Record<string, unknown>, operators)
}

export type LeadPatchFields = {
  status?: LeadStatus
  nextContactAt?: string | null
  estimatedBuildings?: number | null
  notes?: string | null
  outreachVariant?: string | null
}

export async function updateLeadFields(
  admin: SupabaseClient,
  leadId: string,
  fields: LeadPatchFields,
  actor = 'superadmin',
): Promise<SalesLead> {
  if (fields.status) {
    const lead = await updateLeadStatus(admin, leadId, fields.status, actor)
    // Apply remaining field patches after status transition
    const rest: LeadPatchFields = { ...fields }
    delete rest.status
    if (
      rest.nextContactAt === undefined &&
      rest.estimatedBuildings === undefined &&
      rest.notes === undefined &&
      !rest.outreachVariant
    ) {
      return lead
    }
    return updateLeadFields(admin, leadId, rest, actor)
  }

  const { data: current, error: curErr } = await admin
    .from('sales_leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()
  if (curErr || !current) throw new Error(curErr?.message ?? 'lead not found')

  const patch: Record<string, unknown> = {}
  if (fields.nextContactAt !== undefined) patch.next_contact_at = fields.nextContactAt
  if (fields.estimatedBuildings !== undefined) {
    patch.estimated_buildings = fields.estimatedBuildings
    if (fields.estimatedBuildings != null && fields.estimatedBuildings > 0) {
      patch.estimated_mrr_ils = Math.round(fields.estimatedBuildings * 100)
    }
  }
  if (fields.notes !== undefined) patch.notes = fields.notes

  if (Object.keys(patch).length === 0 && !fields.outreachVariant) {
    return rowToLead(current as Record<string, unknown>, await loadOperatorMap(admin))
  }

  let updated = current
  if (Object.keys(patch).length > 0) {
    const { data, error } = await admin
      .from('sales_leads')
      .update(patch)
      .eq('id', leadId)
      .select('*')
      .maybeSingle()
    if (error || !data) throw new Error(error?.message ?? 'update failed')
    updated = data
  }

  if (fields.outreachVariant) {
    await admin.from('sales_lead_events').insert({
      lead_id: leadId,
      actor,
      action: 'outreach_variant',
      from_status: current.status,
      to_status: current.status,
      payload: { variant: fields.outreachVariant },
    })
  } else if (Object.keys(patch).length > 0) {
    await admin.from('sales_lead_events').insert({
      lead_id: leadId,
      actor,
      action: 'fields_update',
      from_status: current.status,
      to_status: current.status,
      payload: patch,
    })
  }

  return rowToLead(updated as Record<string, unknown>, await loadOperatorMap(admin))
}

export async function listRecentRuns(admin: SupabaseClient, limit = 10) {
  const { data, error } = await admin
    .from('sales_lead_discovery_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function deleteSalesLead(
  admin: SupabaseClient,
  leadId: string,
  actor = 'superadmin',
): Promise<void> {
  const { data: current, error: curErr } = await admin
    .from('sales_leads')
    .select('id, status')
    .eq('id', leadId)
    .maybeSingle()
  if (curErr || !current) throw new Error(curErr?.message ?? 'lead not found')

  await admin.from('sales_lead_events').insert({
    lead_id: leadId,
    actor,
    action: 'deleted',
    from_status: current.status,
    to_status: null,
    payload: {},
  })

  const { error } = await admin.from('sales_leads').delete().eq('id', leadId)
  if (error) throw error
}

export async function deleteSalesLeadsBulk(
  admin: SupabaseClient,
  leadIds: string[],
  actor = 'superadmin',
): Promise<{ deleted: number }> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return { deleted: 0 }
  if (ids.length > 200) throw new Error('max 200 deletes per request')

  await admin.from('sales_lead_events').insert(
    ids.map((id) => ({
      lead_id: id,
      actor,
      action: 'deleted',
      payload: { bulk: true },
    })),
  )

  const { error, count } = await admin
    .from('sales_leads')
    .delete({ count: 'exact' })
    .in('id', ids)
  if (error) throw error
  return { deleted: count ?? ids.length }
}

/**
 * Opening a WhatsApp deep link is NOT proof a message was sent.
 * Logs activity only; does not change stage / contacted_at / interest.
 */
export async function markLeadWhatsappOpened(
  admin: SupabaseClient,
  leadId: string,
  actor: string | OperatorActor = 'superadmin',
  variant?: string | null,
): Promise<SalesLead> {
  const actorObj: OperatorActor =
    typeof actor === 'string'
      ? { id: '', displayName: actor, label: actor }
      : actor
  return logWhatsappLinkOpened(admin, leadId, actorObj, variant)
}

export async function enrichLeadFromWebsite(
  admin: SupabaseClient,
  leadId: string,
  actor = 'enrichment',
): Promise<SalesLead | null> {
  const { harvestWebsiteContacts } = await import('@/lib/sales-leads/enrich/website-harvest')
  const { data: current, error: curErr } = await admin
    .from('sales_leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()
  if (curErr || !current) throw new Error(curErr?.message ?? 'lead not found')

  const website = (current.website_url as string | null)?.trim()
  if (!website) return null

  const harvest = await harvestWebsiteContacts(website)
  const enrichment = {
    ...(current.enrichment && typeof current.enrichment === 'object'
      ? (current.enrichment as Record<string, unknown>)
      : {}),
    websiteHarvest: {
      ...harvest,
      harvestedAt: new Date().toISOString(),
    },
  }

  const patch: Record<string, unknown> = { enrichment }
  if (!current.email && harvest.emails[0]) patch.email = harvest.emails[0]
  if (!current.whatsapp_phone && harvest.whatsappPhones[0]) {
    patch.whatsapp_phone = harvest.whatsappPhones[0]
  }
  if (!current.phone && harvest.phones[0]) {
    patch.phone = harvest.phones[0]
    patch.phone_normalized = harvest.phones[0]
  }
  if (
    !current.contactability ||
    current.contactability === 'none' ||
    current.contactability === 'unknown'
  ) {
    if (
      harvest.whatsappPhones[0] ||
      (harvest.phones[0] && String(harvest.phones[0]).startsWith('9725'))
    ) {
      patch.contactability = 'mobile'
    } else if (harvest.phones[0]) {
      patch.contactability = 'landline'
    }
  }

  const { data: updated, error } = await admin
    .from('sales_leads')
    .update(patch)
    .eq('id', leadId)
    .select('*')
    .maybeSingle()
  if (error || !updated) throw new Error(error?.message ?? 'enrich update failed')

  await admin.from('sales_lead_events').insert({
    lead_id: leadId,
    actor,
    action: 'website_harvest',
    from_status: current.status,
    to_status: current.status,
    payload: {
      emails: harvest.emails.length,
      phones: harvest.phones.length,
      wa: harvest.whatsappPhones.length,
      robotsBlocked: harvest.robotsBlocked,
      error: harvest.error ?? null,
    },
  })

  return rowToLead(updated as Record<string, unknown>, await loadOperatorMap(admin))
}

/** Enrich leads that have a website but missing email/whatsapp. Cap per run for serverless. */
export async function enrichSalesLeadsBatch(
  admin: SupabaseClient,
  limit = 25,
): Promise<{ attempted: number; enriched: number; errors: string[] }> {
  const { data, error } = await admin
    .from('sales_leads')
    .select('id, website_url, email, whatsapp_phone')
    .not('website_url', 'is', null)
    .neq('website_url', '')
    .or('email.is.null,whatsapp_phone.is.null')
    .order('updated_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  const rows = data ?? []
  let enriched = 0
  const errors: string[] = []

  for (const row of rows) {
    try {
      const lead = await enrichLeadFromWebsite(admin, row.id as string, 'cron')
      if (lead) enriched += 1
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'enrich failed')
    }
  }

  return { attempted: rows.length, enriched, errors }
}

export async function countDueFollowUps(admin: SupabaseClient): Promise<number> {
  const dayBounds = jerusalemDayBounds()
  const { count, error } = await admin
    .from('sales_leads')
    .select('id', { count: 'exact', head: true })
    .gte('next_action_at', dayBounds.dayStartIso)
    .lte('next_action_at', dayBounds.dayEndIso)
    .in('status', [
      'new',
      'contact_attempt',
      'conversation_held',
      'demo_scheduled',
      'demo_done',
      'proposal_sent',
      'negotiation',
      'deferred',
    ])
  if (error) throw error
  return count ?? 0
}
