export type FitClass = 'suitable' | 'needs_review' | 'unsuitable' | 'unknown'
export type Contactability = 'mobile' | 'landline' | 'unknown' | 'none'

export const LEAD_STATUSES = [
  'discovered',
  'qualified',
  'contacted',
  'demo_scheduled',
  'won',
  'lost',
  'rejected',
  'do_not_contact',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

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
  status: LeadStatus
  fitScore: number | null
  fitClass: FitClass | null
  fitConfidence: number | null
  fitReasons: string[]
  contactability: Contactability | null
  estimatedBuildings: number | null
  estimatedMrrIls: number | null
  outreachAngle: string | null
  notes: string | null
  enrichment: Record<string, unknown>
  sourceRefs: SalesLeadSourceRef[]
  lastSeenAt: string | null
  contactedAt: string | null
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
