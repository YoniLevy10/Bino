import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ACTIVE_LEAD_STAGES,
  deriveTrackingState,
  isInterestLevel,
  isLeadStage,
  OPEN_DEAL_STAGES,
  type InterestLevel,
  type LeadStage,
} from '@/lib/sales-leads/funnel/model'
import { jerusalemDayBounds } from '@/lib/sales-leads/funnel/timezone'
import type { OperatorActor } from '@/lib/sales-leads/operators'
import type {
  FunnelCounters,
  LeadWorkView,
  SalesLead,
  SalesLeadActivity,
  SalesLeadTask,
  SalesOperatorLite,
} from '@/lib/sales-leads/types'
import { coerceLeadStage } from '@/lib/sales-leads/types'

export class LeadConflictError extends Error {
  readonly code = 'LEAD_CONFLICT' as const
  constructor(
    message: string,
    public readonly current: SalesLead | null = null,
  ) {
    super(message)
    this.name = 'LeadConflictError'
  }
}

export class LeadValidationError extends Error {
  readonly code = 'LEAD_VALIDATION' as const
  constructor(message: string) {
    super(message)
    this.name = 'LeadValidationError'
  }
}

type OperatorMap = Map<string, SalesOperatorLite>

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
}

export function rowToLead(
  row: Record<string, unknown>,
  operators?: OperatorMap,
  dayBounds = jerusalemDayBounds(),
): SalesLead {
  const stage = coerceLeadStage(String(row.status ?? 'new'))
  const interestRaw = String(row.interest_level ?? 'unknown')
  const interestLevel: InterestLevel = isInterestLevel(interestRaw) ? interestRaw : 'unknown'
  const ownerOperatorId = (row.owner_operator_id as string | null) ?? null
  const updatedByOperatorId = (row.updated_by_operator_id as string | null) ?? null
  const nextActionAt =
    (row.next_action_at as string | null) ?? (row.next_contact_at as string | null) ?? null
  const nextActionTitle = (row.next_action_title as string | null) ?? null
  const waitingForReply = Boolean(row.waiting_for_reply)
  const waitingUntil = (row.waiting_until as string | null) ?? null
  const trackingState = deriveTrackingState({
    stage,
    nextActionAt,
    waitingForReply,
    waitingUntil,
    dayStartIso: dayBounds.dayStartIso,
    dayEndIso: dayBounds.dayEndIso,
  })
  const needsCompletion =
    !['customer', 'lost'].includes(stage) && (!ownerOperatorId || !nextActionAt)

  return {
    id: String(row.id),
    name: String(row.name),
    businessName: (row.business_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    whatsappPhone: (row.whatsapp_phone as string | null) ?? null,
    phoneNormalized: (row.phone_normalized as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    city: String(row.city),
    searchCity: (row.search_city as string | null) ?? null,
    businessAddress: (row.business_address as string | null) ?? null,
    segmentSlug: String(row.segment_slug ?? 'building_mgmt'),
    sourceName: String(row.source_name),
    sourceUrl: (row.source_url as string | null) ?? null,
    websiteUrl: (row.website_url as string | null) ?? null,
    externalId: (row.external_id as string | null) ?? null,
    status: stage,
    legacyStatus: (row.legacy_status as string | null) ?? null,
    interestLevel,
    ownerOperatorId,
    owner: ownerOperatorId && operators ? (operators.get(ownerOperatorId) ?? null) : null,
    createdByOperatorId: (row.created_by_operator_id as string | null) ?? null,
    updatedByOperatorId,
    updatedBy:
      updatedByOperatorId && operators ? (operators.get(updatedByOperatorId) ?? null) : null,
    version: Number(row.version ?? 1),
    fitScore: (row.fit_score as number | null) ?? null,
    fitClass: (row.fit_class as SalesLead['fitClass']) ?? null,
    fitConfidence: (row.fit_confidence as number | null) ?? null,
    fitReasons: Array.isArray(row.fit_reasons) ? (row.fit_reasons as string[]) : [],
    contactability: (row.contactability as SalesLead['contactability']) ?? null,
    estimatedBuildings: (row.estimated_buildings as number | null) ?? null,
    estimatedUnits: (row.estimated_units as number | null) ?? null,
    estimatedMrrIls: (row.estimated_mrr_ils as number | null) ?? null,
    estimatedSetupFeeIls: (row.estimated_setup_fee_ils as number | null) ?? null,
    outreachAngle: (row.outreach_angle as string | null) ?? null,
    primaryNeed: (row.primary_need as string | null) ?? null,
    contactRole: (row.contact_role as string | null) ?? null,
    isDecisionMaker:
      row.is_decision_maker == null ? null : Boolean(row.is_decision_maker),
    notes: (row.notes as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    lostReason: (row.lost_reason as string | null) ?? null,
    lostReasonDetail: (row.lost_reason_detail as string | null) ?? null,
    deferredUntil: (row.deferred_until as string | null) ?? null,
    waitingForReply,
    waitingUntil,
    enrichment:
      row.enrichment && typeof row.enrichment === 'object'
        ? (row.enrichment as Record<string, unknown>)
        : {},
    sourceRefs: Array.isArray(row.source_refs)
      ? (row.source_refs as SalesLead['sourceRefs'])
      : [],
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    contactedAt: (row.contacted_at as string | null) ?? null,
    lastContactAt: (row.last_contact_at as string | null) ?? null,
    nextContactAt: (row.next_contact_at as string | null) ?? nextActionAt,
    nextActionTitle,
    nextActionAt,
    trackingState,
    needsCompletion,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function loadOperatorMap(admin: SupabaseClient): Promise<OperatorMap> {
  const { data, error } = await admin.from('sales_operators').select('id, display_name')
  if (error) {
    // Table may not exist yet before migration — degrade gracefully for reads in tests
    if (/does not exist|relation/i.test(error.message)) return new Map()
    throw error
  }
  const map: OperatorMap = new Map()
  for (const r of data ?? []) {
    map.set(String(r.id), { id: String(r.id), displayName: String(r.display_name) })
  }
  return map
}

async function insertActivity(
  admin: SupabaseClient,
  input: {
    leadId: string
    actor: OperatorActor | { id?: string | null; label: string }
    activityType: string
    body?: string | null
    outcome?: string | null
    payload?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await admin.from('sales_lead_activities').insert({
    lead_id: input.leadId,
    operator_id: input.actor.id ?? null,
    actor_label: input.actor.label,
    activity_type: input.activityType,
    body: input.body ?? null,
    outcome: input.outcome ?? null,
    payload: input.payload ?? {},
  })
  if (error && !/does not exist|relation/i.test(error.message)) throw error
}

async function refreshNextActionFromTasks(
  admin: SupabaseClient,
  leadId: string,
): Promise<{ title: string | null; dueAt: string | null; waiting: boolean }> {
  const { data, error } = await admin
    .from('sales_lead_tasks')
    .select('title, due_at, waiting_for_reply')
    .eq('lead_id', leadId)
    .eq('status', 'open')
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error && !/does not exist|relation/i.test(error.message)) throw error

  const title = data ? String(data.title) : null
  const dueAt = data ? (data.due_at as string) : null
  const waiting = Boolean(data?.waiting_for_reply)

  const { error: upErr } = await admin
    .from('sales_leads')
    .update({
      next_action_title: title,
      next_action_at: dueAt,
      next_contact_at: dueAt,
      waiting_for_reply: waiting,
    })
    .eq('id', leadId)
  if (upErr) throw upErr
  return { title, dueAt, waiting }
}

export type ListFunnelFilters = {
  q?: string
  status?: LeadStage | LeadStage[]
  fitClass?: string | string[]
  city?: string
  segmentSlug?: string
  contactability?: string | string[]
  minFitScore?: number
  interestLevel?: InterestLevel | InterestLevel[]
  ownerOperatorId?: string | null
  view?: LeadWorkView
  viewerOperatorId?: string | null
  sort?: 'fit_score' | 'created_at' | 'estimated_mrr' | 'next_contact' | 'updated_at'
  limit?: number
  offset?: number
}

function applyCommonFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: ListFunnelFilters,
  dayBounds: ReturnType<typeof jerusalemDayBounds>,
) {
  let q = query
  if (filters.city) q = q.eq('city', filters.city)
  if (filters.segmentSlug) q = q.eq('segment_slug', filters.segmentSlug)
  if (filters.contactability) {
    const vals = (
      Array.isArray(filters.contactability) ? filters.contactability : [filters.contactability]
    )
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter(Boolean)
    if (vals.length) q = q.in('contactability', vals)
  }
  if (filters.fitClass) {
    const classes = (Array.isArray(filters.fitClass) ? filters.fitClass : [filters.fitClass])
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter(Boolean)
    if (classes.length) q = q.in('fit_class', classes)
  }
  if (filters.interestLevel) {
    const levels = (
      Array.isArray(filters.interestLevel) ? filters.interestLevel : [filters.interestLevel]
    )
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter((s): s is InterestLevel => isInterestLevel(s))
    if (levels.length) q = q.in('interest_level', levels)
  }
  if (filters.minFitScore != null && Number.isFinite(filters.minFitScore)) {
    q = q.gte('fit_score', filters.minFitScore)
  }
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`
    q = q.or(
      `name.ilike.${term},business_name.ilike.${term},phone.ilike.${term},notes.ilike.${term},summary.ilike.${term}`,
    )
  }

  const view = filters.view ?? 'active'
  switch (view) {
    case 'active':
      q = q.in('status', [...ACTIVE_LEAD_STAGES])
      break
    case 'mine':
      if (filters.viewerOperatorId) {
        q = q.eq('owner_operator_id', filters.viewerOperatorId)
        q = q.in('status', [...ACTIVE_LEAD_STAGES, 'deferred'])
      }
      break
    case 'due_today':
      q = q
        .in('status', [...ACTIVE_LEAD_STAGES, 'deferred'])
        .not('next_action_at', 'is', null)
        .gte('next_action_at', dayBounds.dayStartIso)
        .lte('next_action_at', dayBounds.dayEndIso)
      break
    case 'overdue':
      q = q
        .in('status', [...ACTIVE_LEAD_STAGES, 'deferred'])
        .not('next_action_at', 'is', null)
        .lt('next_action_at', dayBounds.dayStartIso)
      break
    case 'interested':
      q = q.eq('interest_level', 'interested').in('status', [...ACTIVE_LEAD_STAGES, 'deferred'])
      break
    case 'needs_completion':
      q = q
        .in('status', [...ACTIVE_LEAD_STAGES, 'deferred'])
        .or('owner_operator_id.is.null,next_action_at.is.null')
      break
    case 'waiting':
      q = q.eq('waiting_for_reply', true).in('status', [...ACTIVE_LEAD_STAGES, 'deferred'])
      break
    case 'customers':
      q = q.eq('status', 'customer')
      break
    case 'lost':
      q = q.eq('status', 'lost')
      break
    case 'deferred':
      q = q.eq('status', 'deferred')
      break
    case 'all':
      break
  }

  if (filters.status && view === 'all') {
    const statuses = (Array.isArray(filters.status) ? filters.status : [filters.status])
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter((s): s is LeadStage => isLeadStage(s))
    if (statuses.length) q = q.in('status', statuses)
  } else if (filters.status && view === 'active') {
    // allow narrowing active view further
    const statuses = (Array.isArray(filters.status) ? filters.status : [filters.status])
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter((s): s is LeadStage => isLeadStage(s))
    if (statuses.length) q = q.in('status', statuses)
  }

  if (filters.ownerOperatorId === 'none') {
    q = q.is('owner_operator_id', null)
  } else if (filters.ownerOperatorId) {
    q = q.eq('owner_operator_id', filters.ownerOperatorId)
  }

  return q
}

export async function listFunnelLeads(
  admin: SupabaseClient,
  filters: ListFunnelFilters = {},
): Promise<{ leads: SalesLead[]; total: number; dayBounds: ReturnType<typeof jerusalemDayBounds> }> {
  const limit = Math.min(filters.limit ?? 50, 200)
  const offset = filters.offset ?? 0
  const sort = filters.sort ?? 'next_contact'
  const dayBounds = jerusalemDayBounds()
  const sortColumn =
    sort === 'created_at'
      ? 'created_at'
      : sort === 'estimated_mrr'
        ? 'estimated_mrr_ils'
        : sort === 'updated_at'
          ? 'updated_at'
          : sort === 'fit_score'
            ? 'fit_score'
            : 'next_action_at'

  let query = admin.from('sales_leads').select('*', { count: 'exact' })
  query = applyCommonFilters(query, filters, dayBounds)
  query = query
    .order(sortColumn, {
      ascending: sortColumn === 'next_action_at',
      nullsFirst: false,
    })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  const operators = await loadOperatorMap(admin)
  return {
    leads: (data ?? []).map((r) => rowToLead(asRecord(r), operators, dayBounds)),
    total: count ?? 0,
    dayBounds,
  }
}

/** Metrics over ALL filtered rows (not just current page). */
export async function getFunnelCounters(
  admin: SupabaseClient,
  filters: ListFunnelFilters = {},
): Promise<FunnelCounters> {
  const dayBounds = jerusalemDayBounds()
  // Pull filtered rows without pagination — cap for safety
  let query = admin
    .from('sales_leads')
    .select(
      'status, interest_level, next_action_at, waiting_for_reply, waiting_until, owner_operator_id, estimated_mrr_ils, estimated_setup_fee_ils',
    )
    .limit(10000)
  query = applyCommonFilters(query, filters, dayBounds)
  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []

  const byStage: Record<string, number> = {}
  let activeCount = 0
  let interestedCount = 0
  let dueTodayCount = 0
  let overdueCount = 0
  let upcomingDemosCount = 0
  let openProposalsCount = 0
  let potentialSetupFeeIls = 0
  let potentialMrrIls = 0
  let dealsMissingValue = 0
  let openDealsWithValue = 0

  for (const raw of rows) {
    const r = asRecord(raw)
    const stage = coerceLeadStage(String(r.status ?? 'new'))
    byStage[stage] = (byStage[stage] ?? 0) + 1
    const interest = String(r.interest_level ?? 'unknown')
    const nextAt = (r.next_action_at as string | null) ?? null
    const tracking = deriveTrackingState({
      stage,
      nextActionAt: nextAt,
      waitingForReply: Boolean(r.waiting_for_reply),
      waitingUntil: (r.waiting_until as string | null) ?? null,
      dayStartIso: dayBounds.dayStartIso,
      dayEndIso: dayBounds.dayEndIso,
    })

    if ((ACTIVE_LEAD_STAGES as readonly string[]).includes(stage)) activeCount += 1
    if (interest === 'interested' && stage !== 'customer' && stage !== 'lost') {
      interestedCount += 1
    }
    if (tracking === 'due_today') dueTodayCount += 1
    if (tracking === 'overdue') overdueCount += 1
    if (stage === 'demo_scheduled' && nextAt && nextAt >= dayBounds.dayStartIso) {
      upcomingDemosCount += 1
    }
    if (stage === 'proposal_sent' || stage === 'negotiation') openProposalsCount += 1

    const isOpenDeal = (OPEN_DEAL_STAGES as readonly string[]).includes(stage) && stage !== 'deferred'
      ? true
      : (OPEN_DEAL_STAGES as readonly string[]).includes(stage) && stage === 'deferred'
        ? true
        : (ACTIVE_LEAD_STAGES as readonly string[]).includes(stage)

    // Open potential: active + deferred, exclude customer/lost
    if (stage !== 'customer' && stage !== 'lost') {
      const setup = r.estimated_setup_fee_ils
      const mrr = r.estimated_mrr_ils
      const hasSetup = setup != null && Number.isFinite(Number(setup))
      const hasMrr = mrr != null && Number.isFinite(Number(mrr))
      if (hasSetup) potentialSetupFeeIls += Number(setup)
      if (hasMrr) potentialMrrIls += Number(mrr)
      if (hasSetup || hasMrr) openDealsWithValue += 1
      else if (isOpenDeal || true) dealsMissingValue += 1
    }
  }

  // Fix dealsMissingValue: only count open (non-customer/lost) without either value
  dealsMissingValue = 0
  openDealsWithValue = 0
  potentialSetupFeeIls = 0
  potentialMrrIls = 0
  for (const raw of rows) {
    const r = asRecord(raw)
    const stage = coerceLeadStage(String(r.status ?? 'new'))
    if (stage === 'customer' || stage === 'lost') continue
    const setup = r.estimated_setup_fee_ils
    const mrr = r.estimated_mrr_ils
    const hasSetup = setup != null && Number.isFinite(Number(setup))
    const hasMrr = mrr != null && Number.isFinite(Number(mrr))
    if (hasSetup) potentialSetupFeeIls += Number(setup)
    if (hasMrr) potentialMrrIls += Number(mrr)
    if (hasSetup || hasMrr) openDealsWithValue += 1
    else dealsMissingValue += 1
  }

  return {
    activeCount,
    interestedCount,
    dueTodayCount,
    overdueCount,
    upcomingDemosCount,
    openProposalsCount,
    byStage,
    potentialSetupFeeIls,
    potentialMrrIls,
    dealsMissingValue,
    openDealsWithValue,
    filterScope: filters.view ?? 'active',
    dayYmd: dayBounds.ymd,
    timezone: 'Asia/Jerusalem',
  }
}

export async function getLeadById(
  admin: SupabaseClient,
  leadId: string,
): Promise<SalesLead | null> {
  const { data, error } = await admin.from('sales_leads').select('*').eq('id', leadId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const operators = await loadOperatorMap(admin)
  return rowToLead(asRecord(data), operators)
}

export type FunnelPatch = {
  expectedVersion: number
  status?: LeadStage
  interestLevel?: InterestLevel
  ownerOperatorId?: string | null
  summary?: string | null
  notes?: string | null
  estimatedBuildings?: number | null
  estimatedUnits?: number | null
  estimatedMrrIls?: number | null
  estimatedSetupFeeIls?: number | null
  primaryNeed?: string | null
  contactRole?: string | null
  isDecisionMaker?: boolean | null
  lostReason?: string | null
  lostReasonDetail?: string | null
  deferredUntil?: string | null
  waitingForReply?: boolean
  waitingUntil?: string | null
  outreachVariant?: string | null
  /** Set next action by creating/replacing open task */
  nextActionTitle?: string | null
  nextActionAt?: string | null
}

export async function patchLeadOptimistic(
  admin: SupabaseClient,
  leadId: string,
  patch: FunnelPatch,
  actor: OperatorActor,
): Promise<SalesLead> {
  if (!Number.isFinite(patch.expectedVersion)) {
    throw new LeadValidationError('expectedVersion required')
  }

  const current = await getLeadById(admin, leadId)
  if (!current) throw new LeadValidationError('lead not found')
  if (current.version !== patch.expectedVersion) {
    throw new LeadConflictError('הליד עודכן בינתיים — רעננו ושמרו מחדש', current)
  }

  if (patch.status && !isLeadStage(patch.status)) {
    throw new LeadValidationError('invalid stage')
  }
  if (patch.interestLevel && !isInterestLevel(patch.interestLevel)) {
    throw new LeadValidationError('invalid interest level')
  }
  if (patch.status === 'lost' && !patch.lostReason && !current.lostReason) {
    throw new LeadValidationError('lost reason required')
  }
  if (patch.status === 'lost' && (patch.lostReason === 'other' || current.lostReason === 'other')) {
    const detail = patch.lostReasonDetail ?? current.lostReasonDetail
    if (patch.lostReason === 'other' && !detail?.trim()) {
      throw new LeadValidationError('lost reason detail required for other')
    }
  }
  if (patch.status === 'deferred') {
    const until = patch.deferredUntil !== undefined ? patch.deferredUntil : current.deferredUntil
    if (!until) throw new LeadValidationError('deferred_until required')
  }

  const dbPatch: Record<string, unknown> = {
    version: patch.expectedVersion + 1,
    updated_by_operator_id: actor.id,
  }

  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.interestLevel !== undefined) dbPatch.interest_level = patch.interestLevel
  if (patch.ownerOperatorId !== undefined) dbPatch.owner_operator_id = patch.ownerOperatorId
  if (patch.summary !== undefined) dbPatch.summary = patch.summary
  if (patch.notes !== undefined) dbPatch.notes = patch.notes
  if (patch.estimatedBuildings !== undefined) {
    dbPatch.estimated_buildings = patch.estimatedBuildings
  }
  if (patch.estimatedUnits !== undefined) dbPatch.estimated_units = patch.estimatedUnits
  if (patch.estimatedMrrIls !== undefined) {
    dbPatch.estimated_mrr_ils = patch.estimatedMrrIls
  } else if (
    patch.estimatedBuildings != null &&
    patch.estimatedBuildings > 0 &&
    patch.estimatedMrrIls === undefined
  ) {
    dbPatch.estimated_mrr_ils = Math.round(patch.estimatedBuildings * 100)
  }
  if (patch.estimatedSetupFeeIls !== undefined) {
    dbPatch.estimated_setup_fee_ils = patch.estimatedSetupFeeIls
  }
  if (patch.primaryNeed !== undefined) dbPatch.primary_need = patch.primaryNeed
  if (patch.contactRole !== undefined) dbPatch.contact_role = patch.contactRole
  if (patch.isDecisionMaker !== undefined) dbPatch.is_decision_maker = patch.isDecisionMaker
  if (patch.lostReason !== undefined) dbPatch.lost_reason = patch.lostReason
  if (patch.lostReasonDetail !== undefined) dbPatch.lost_reason_detail = patch.lostReasonDetail
  if (patch.deferredUntil !== undefined) dbPatch.deferred_until = patch.deferredUntil
  if (patch.waitingForReply !== undefined) dbPatch.waiting_for_reply = patch.waitingForReply
  if (patch.waitingUntil !== undefined) dbPatch.waiting_until = patch.waitingUntil

  if (patch.status === 'customer' || patch.status === 'lost') {
    // keep tasks history; clear denormalized next action for closed
    dbPatch.next_action_at = null
    dbPatch.next_action_title = null
    dbPatch.next_contact_at = null
  }

  const { data: updated, error } = await admin
    .from('sales_leads')
    .update(dbPatch)
    .eq('id', leadId)
    .eq('version', patch.expectedVersion)
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (!updated) {
    const fresh = await getLeadById(admin, leadId)
    throw new LeadConflictError('הליד עודכן בינתיים — רעננו ושמרו מחדש', fresh)
  }

  // Activities for meaningful changes
  if (patch.status && patch.status !== current.status) {
    await insertActivity(admin, {
      leadId,
      actor,
      activityType: 'stage_change',
      body: `${current.status} → ${patch.status}`,
      payload: {
        from: current.status,
        to: patch.status,
        lostReason: patch.lostReason ?? null,
        deferredUntil: patch.deferredUntil ?? null,
      },
    })
    // Also keep legacy events table in sync
    await admin.from('sales_lead_events').insert({
      lead_id: leadId,
      actor: actor.label,
      action: 'status_change',
      from_status: current.status,
      to_status: patch.status,
      payload: {},
    })
  }
  if (patch.interestLevel && patch.interestLevel !== current.interestLevel) {
    await insertActivity(admin, {
      leadId,
      actor,
      activityType: 'interest_change',
      body: `${current.interestLevel} → ${patch.interestLevel}`,
      payload: { from: current.interestLevel, to: patch.interestLevel },
    })
  }
  if (
    patch.ownerOperatorId !== undefined &&
    patch.ownerOperatorId !== current.ownerOperatorId
  ) {
    await insertActivity(admin, {
      leadId,
      actor,
      activityType: 'owner_change',
      body: 'החלפת אחראי',
      payload: { from: current.ownerOperatorId, to: patch.ownerOperatorId },
    })
  }
  if (patch.notes !== undefined && patch.notes !== current.notes && patch.notes?.trim()) {
    // Legacy notes field update also becomes an append-only activity
    await insertActivity(admin, {
      leadId,
      actor,
      activityType: 'note',
      body: patch.notes,
      payload: { via: 'notes_field' },
    })
  }
  if (patch.outreachVariant) {
    await admin.from('sales_lead_events').insert({
      lead_id: leadId,
      actor: actor.label,
      action: 'outreach_variant',
      from_status: current.status,
      to_status: updated.status,
      payload: { variant: patch.outreachVariant },
    })
  }

  // Next action via task upsert
  if (patch.nextActionTitle !== undefined || patch.nextActionAt !== undefined) {
    const title = (patch.nextActionTitle ?? current.nextActionTitle ?? 'מעקב').trim() || 'מעקב'
    const dueAt = patch.nextActionAt !== undefined ? patch.nextActionAt : current.nextActionAt
    if (dueAt) {
      // Cancel previous open tasks then create one (single source of truth)
      await admin
        .from('sales_lead_tasks')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('status', 'open')
      const { error: taskErr } = await admin.from('sales_lead_tasks').insert({
        lead_id: leadId,
        title,
        due_at: dueAt,
        status: 'open',
        waiting_for_reply: Boolean(
          patch.waitingForReply !== undefined ? patch.waitingForReply : current.waitingForReply,
        ),
        created_by_operator_id: actor.id,
      })
      if (taskErr) throw taskErr
      await insertActivity(admin, {
        leadId,
        actor,
        activityType: 'task_created',
        body: title,
        payload: { dueAt },
      })
      await refreshNextActionFromTasks(admin, leadId)
    } else if (patch.nextActionAt === null) {
      await admin
        .from('sales_lead_tasks')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('status', 'open')
      await refreshNextActionFromTasks(admin, leadId)
    }
  }

  const operators = await loadOperatorMap(admin)
  return rowToLead(asRecord(updated), operators)
}

/** Atomic claim: only succeeds if owner is currently null. */
export async function claimLead(
  admin: SupabaseClient,
  leadId: string,
  actor: OperatorActor,
  expectedVersion: number,
): Promise<SalesLead> {
  const { data, error } = await admin
    .from('sales_leads')
    .update({
      owner_operator_id: actor.id,
      updated_by_operator_id: actor.id,
      version: expectedVersion + 1,
    })
    .eq('id', leadId)
    .eq('version', expectedVersion)
    .is('owner_operator_id', null)
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (!data) {
    const fresh = await getLeadById(admin, leadId)
    if (!fresh) throw new LeadValidationError('lead not found')
    if (fresh.ownerOperatorId) {
      throw new LeadConflictError('הליד כבר בטיפול של מישהו אחר', fresh)
    }
    throw new LeadConflictError('הליד עודכן בינתיים — רעננו ושמרו מחדש', fresh)
  }

  await insertActivity(admin, {
    leadId,
    actor,
    activityType: 'owner_change',
    body: 'לקחתי לטיפולי',
    payload: { to: actor.id, claim: true },
  })

  const operators = await loadOperatorMap(admin)
  return rowToLead(asRecord(data), operators)
}

export async function addLeadActivity(
  admin: SupabaseClient,
  input: {
    leadId: string
    actor: OperatorActor
    activityType: string
    body?: string | null
    outcome?: string | null
    payload?: Record<string, unknown>
    /** When true, bump last_contact_at (actual contact only). */
    touchesContact?: boolean
    expectedVersion?: number
    /** Optional stage change after contact outcome */
    setStage?: LeadStage
  },
): Promise<{ activity: SalesLeadActivity; lead: SalesLead }> {
  const lead = await getLeadById(admin, input.leadId)
  if (!lead) throw new LeadValidationError('lead not found')

  if (input.expectedVersion != null && lead.version !== input.expectedVersion) {
    throw new LeadConflictError('הליד עודכן בינתיים — רעננו ושמרו מחדש', lead)
  }

  const { data: activityRow, error } = await admin
    .from('sales_lead_activities')
    .insert({
      lead_id: input.leadId,
      operator_id: input.actor.id,
      actor_label: input.actor.label,
      activity_type: input.activityType,
      body: input.body ?? null,
      outcome: input.outcome ?? null,
      payload: input.payload ?? {},
    })
    .select('*')
    .maybeSingle()
  if (error || !activityRow) throw new Error(error?.message ?? 'activity insert failed')

  const dbPatch: Record<string, unknown> = {
    updated_by_operator_id: input.actor.id,
  }
  if (input.expectedVersion != null) {
    dbPatch.version = input.expectedVersion + 1
  } else {
    dbPatch.version = lead.version + 1
  }

  if (input.touchesContact) {
    const now = new Date().toISOString()
    dbPatch.last_contact_at = now
    if (!lead.contactedAt) dbPatch.contacted_at = now
  }
  if (input.setStage && isLeadStage(input.setStage)) {
    dbPatch.status = input.setStage
  }
  // no_answer must NOT set interest to not_interested

  let versionFilter = lead.version
  if (input.expectedVersion != null) versionFilter = input.expectedVersion

  const { data: updated, error: upErr } = await admin
    .from('sales_leads')
    .update(dbPatch)
    .eq('id', input.leadId)
    .eq('version', versionFilter)
    .select('*')
    .maybeSingle()
  if (upErr) throw upErr
  if (!updated) {
    const fresh = await getLeadById(admin, input.leadId)
    throw new LeadConflictError('הליד עודכן בינתיים — רעננו ושמרו מחדש', fresh)
  }

  if (input.setStage && input.setStage !== lead.status) {
    await insertActivity(admin, {
      leadId: input.leadId,
      actor: input.actor,
      activityType: 'stage_change',
      body: `${lead.status} → ${input.setStage}`,
      payload: { from: lead.status, to: input.setStage, via: input.activityType },
    })
  }

  const operators = await loadOperatorMap(admin)
  return {
    activity: activityFromRow(asRecord(activityRow)),
    lead: rowToLead(asRecord(updated), operators),
  }
}

function activityFromRow(row: Record<string, unknown>): SalesLeadActivity {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    operatorId: (row.operator_id as string | null) ?? null,
    actorLabel: String(row.actor_label),
    activityType: row.activity_type as SalesLeadActivity['activityType'],
    body: (row.body as string | null) ?? null,
    outcome: (row.outcome as string | null) ?? null,
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at),
    editedAt: (row.edited_at as string | null) ?? null,
  }
}

export async function listLeadActivities(
  admin: SupabaseClient,
  leadId: string,
  limit = 100,
): Promise<SalesLeadActivity[]> {
  const { data, error } = await admin
    .from('sales_lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => activityFromRow(asRecord(r)))
}

export async function editLeadActivityNote(
  admin: SupabaseClient,
  activityId: string,
  newBody: string,
  actor: OperatorActor,
): Promise<SalesLeadActivity> {
  const { data: current, error } = await admin
    .from('sales_lead_activities')
    .select('*')
    .eq('id', activityId)
    .maybeSingle()
  if (error || !current) throw new LeadValidationError(error?.message ?? 'activity not found')
  if (current.activity_type !== 'note') {
    throw new LeadValidationError('only notes can be edited')
  }
  const history = Array.isArray(current.edit_history) ? current.edit_history : []
  history.push({
    at: new Date().toISOString(),
    by: actor.label,
    operatorId: actor.id,
    previousBody: current.body,
  })
  const { data: updated, error: upErr } = await admin
    .from('sales_lead_activities')
    .update({
      body: newBody,
      edited_at: new Date().toISOString(),
      edit_history: history,
    })
    .eq('id', activityId)
    .select('*')
    .maybeSingle()
  if (upErr || !updated) throw new Error(upErr?.message ?? 'edit failed')
  return activityFromRow(asRecord(updated))
}

function taskFromRow(row: Record<string, unknown>): SalesLeadTask {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    title: String(row.title),
    dueAt: String(row.due_at),
    status: row.status as SalesLeadTask['status'],
    waitingForReply: Boolean(row.waiting_for_reply),
    createdByOperatorId: (row.created_by_operator_id as string | null) ?? null,
    completedByOperatorId: (row.completed_by_operator_id as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function listLeadTasks(
  admin: SupabaseClient,
  leadId: string,
): Promise<SalesLeadTask[]> {
  const { data, error } = await admin
    .from('sales_lead_tasks')
    .select('*')
    .eq('lead_id', leadId)
    .order('due_at', { ascending: true })
    .limit(100)
  if (error) throw error
  return (data ?? []).map((r) => taskFromRow(asRecord(r)))
}

export async function completeLeadTask(
  admin: SupabaseClient,
  taskId: string,
  actor: OperatorActor,
  followUp?: { title: string; dueAt: string; waitingForReply?: boolean },
): Promise<{ task: SalesLeadTask; lead: SalesLead }> {
  const { data: task, error } = await admin
    .from('sales_lead_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle()
  if (error || !task) throw new LeadValidationError(error?.message ?? 'task not found')
  if (task.status !== 'open') throw new LeadValidationError('task is not open')

  const now = new Date().toISOString()
  const { data: done, error: upErr } = await admin
    .from('sales_lead_tasks')
    .update({
      status: 'done',
      completed_at: now,
      completed_by_operator_id: actor.id,
      updated_at: now,
    })
    .eq('id', taskId)
    .eq('status', 'open')
    .select('*')
    .maybeSingle()
  if (upErr || !done) throw new Error(upErr?.message ?? 'complete failed')

  const leadId = String(task.lead_id)
  await insertActivity(admin, {
    leadId,
    actor,
    activityType: 'task_done',
    body: String(task.title),
    payload: { taskId },
  })

  if (followUp?.title && followUp.dueAt) {
    const { error: insErr } = await admin.from('sales_lead_tasks').insert({
      lead_id: leadId,
      title: followUp.title.trim(),
      due_at: followUp.dueAt,
      status: 'open',
      waiting_for_reply: Boolean(followUp.waitingForReply),
      created_by_operator_id: actor.id,
    })
    if (insErr) throw insErr
    await insertActivity(admin, {
      leadId,
      actor,
      activityType: 'task_created',
      body: followUp.title.trim(),
      payload: { dueAt: followUp.dueAt, afterComplete: true },
    })
  }

  await refreshNextActionFromTasks(admin, leadId)
  const lead = await getLeadById(admin, leadId)
  if (!lead) throw new LeadValidationError('lead not found')
  return { task: taskFromRow(asRecord(done)), lead }
}

/**
 * WhatsApp link opened — logs only. Does NOT mark as contacted / change stage.
 * User must manually log a whatsapp activity to confirm send.
 */
export async function logWhatsappLinkOpened(
  admin: SupabaseClient,
  leadId: string,
  actor: OperatorActor,
  variant?: string | null,
): Promise<SalesLead> {
  const lead = await getLeadById(admin, leadId)
  if (!lead) throw new LeadValidationError('lead not found')

  await insertActivity(admin, {
    leadId,
    actor,
    activityType: 'whatsapp_link_opened',
    body: 'נפתח קישור WhatsApp (לא מסומן כשליחה)',
    payload: { variant: variant ?? null, confirmedSend: false },
  })
  await admin.from('sales_lead_events').insert({
    lead_id: leadId,
    actor: actor.label,
    action: 'whatsapp_link_opened',
    from_status: lead.status,
    to_status: lead.status,
    payload: { variant: variant ?? null, confirmedSend: false },
  })
  return lead
}
