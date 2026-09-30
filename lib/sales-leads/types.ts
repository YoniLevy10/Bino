export type FitClass = 'suitable' | 'needs_review' | 'unsuitable' | 'unknown'
export type Contactability = 'mobile' | 'landline' | 'unknown' | 'none'

import type {
  ActivityType,
  InterestLevel,
  LeadStage,
  TrackingState,
} from '@/lib/sales-leads/funnel/model'
import {
  LEAD_STAGES,
  mapLegacyStatusToStage,
} from '@/lib/sales-leads/funnel/model'

/** @deprecated Use LEAD_STAGES / LeadStage — kept as alias for gradual migration. */
export const LEAD_STATUSES = LEAD_STAGES
export type LeadStatus = LeadStage

export type { ActivityType, InterestLevel, LeadStage, TrackingState }

export type SalesLeadSourceRef = {
  source: string
  externalId?: string | null
  url?: string | null
  seenAt: string
}

/** Unified record from every source adapter before dedupe/save. */
export type SalesLeadSourceRecord = {
  name: string
  businessName?: string | null
  phone?: string | null
  whatsappPhone?: string | null
  email?: string | null
  city: string
  searchCity?: string | null
  businessAddress?: string | null
  segmentSlug?: string | null
  sourceName: string
  sourceUrl?: string | null
  websiteUrl?: string | null
  externalId?: string | null
  notes?: string | null
  outreachAngle?: string | null
  fitScore?: number | null
  fitClass?: FitClass | null
  fitConfidence?: number | null
  fitReasons?: string[] | null
  contactability?: Contactability | null
  estimatedBuildings?: number | null
  estimatedMrrIls?: number | null
  queryKey?: string | null
  placeTypes?: string[] | null
  reviewCount?: number | null
  rating?: number | null
  openingHours?: string[] | null
}

export type SalesOperatorLite = {
  id: string
  displayName: string
}

export type SalesLead = {
  id: string
  name: string
  businessName: string | null
  phone: string | null
  whatsappPhone: string | null
  phoneNormalized: string | null
  email: string | null
  city: string
  searchCity: string | null
  businessAddress: string | null
  segmentSlug: string
  sourceName: string
  sourceUrl: string | null
  websiteUrl: string | null
  externalId: string | null
  /** Sales stage (funnel). */
  status: LeadStage
  legacyStatus: string | null
  interestLevel: InterestLevel
  ownerOperatorId: string | null
  owner?: SalesOperatorLite | null
  createdByOperatorId: string | null
  updatedByOperatorId: string | null
  updatedBy?: SalesOperatorLite | null
  version: number
  fitScore: number | null
  fitClass: FitClass | null
  fitConfidence: number | null
  fitReasons: string[]
  contactability: Contactability | null
  estimatedBuildings: number | null
  estimatedUnits: number | null
  estimatedMrrIls: number | null
  estimatedSetupFeeIls: number | null
  outreachAngle: string | null
  primaryNeed: string | null
  contactRole: string | null
  isDecisionMaker: boolean | null
  notes: string | null
  summary: string | null
  lostReason: string | null
  lostReasonDetail: string | null
  deferredUntil: string | null
  waitingForReply: boolean
  waitingUntil: string | null
  enrichment: Record<string, unknown>
  sourceRefs: SalesLeadSourceRef[]
  lastSeenAt: string | null
  contactedAt: string | null
  lastContactAt: string | null
  nextContactAt: string | null
  nextActionTitle: string | null
  nextActionAt: string | null
  trackingState: TrackingState
  needsCompletion: boolean
  createdAt: string
  updatedAt: string
}

export type SalesLeadActivity = {
  id: string
  leadId: string
  operatorId: string | null
  actorLabel: string
  activityType: ActivityType
  body: string | null
  outcome: string | null
  payload: Record<string, unknown>
  createdAt: string
  editedAt: string | null
}

export type SalesLeadTask = {
  id: string
  leadId: string
  title: string
  dueAt: string
  status: 'open' | 'done' | 'cancelled'
  waitingForReply: boolean
  createdByOperatorId: string | null
  completedByOperatorId: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type DiscoveryTrigger = 'cron' | 'manual'
export type DiscoveryAutoSource = 'google_places' | 'osm'

export type DiscoveryProgress = {
  progressPct: number
  phase: string
  currentSource?: string | null
  found?: number
  created?: number
}

export type DiscoveryRunResult = {
  runId: string | null
  status: 'completed' | 'failed' | 'busy'
  city: string
  sources: string[]
  found: number
  created: number
  updated: number
  skipped: number
  errors: number
  budget: number
  apiCallBudget: number
  errorMessage?: string
  bySource: Record<
    string,
    {
      found: number
      created: number
      updated: number
      skipped: number
      errors: string[]
    }
  >
}

export type LeadWorkView =
  | 'active'
  | 'mine'
  | 'due_today'
  | 'overdue'
  | 'interested'
  | 'needs_completion'
  | 'waiting'
  | 'customers'
  | 'lost'
  | 'deferred'
  | 'all'

export type FunnelCounters = {
  activeCount: number
  interestedCount: number
  dueTodayCount: number
  overdueCount: number
  upcomingDemosCount: number
  openProposalsCount: number
  byStage: Record<string, number>
  potentialSetupFeeIls: number
  potentialMrrIls: number
  dealsMissingValue: number
  openDealsWithValue: number
  filterScope: string
  dayYmd: string
  timezone: 'Asia/Jerusalem'
}

/** Normalize any stored status (legacy or new) to a LeadStage. */
export function coerceLeadStage(status: string): LeadStage {
  return mapLegacyStatusToStage(status)
}
