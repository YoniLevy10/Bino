/**
 * Buyer fit scoring for BINO sales leads.
 * Prefer organizations that manage multi-site / multi-building operations.
 * Reject solo trades, retail shops, and consumer home-service performers
 * (those belong to Fixly recruitment, not BINO platform sales).
 */

import { BUYER_FIT_WEIGHTS, SEGMENT_MRR_HINT } from '@/lib/sales-leads/config'
import { classifyPhoneKind, type PhoneKind } from '@/lib/sales-leads/phone'
import type { Contactability, FitClass } from '@/lib/sales-leads/types'

export type FitAssessment = {
  score: number
  confidence: number
  fitClass: FitClass
  reasons: string[]
  contactability: Contactability
  phoneKind: PhoneKind
  estimatedMrrIls: number | null
}

const ORG_BUYER_MARKERS = [
  /חברת\s/,
  /חברה\s/,
  /ניהול/,
  /אחזק/,
  /מתקנ/,
  /facility/i,
  /property\s*manag/i,
  /building\s*manag/i,
  /ועד\s*בית/,
  /דיור/,
  /מעונות/,
  /דיור\s*מוגן/,
  /יזמ/,
  /נדל.?ן/,
  /קיבוץ/,
  /מושב/,
  /עירוני/,
  /מוניציפ/,
  /רשות/,
  /אגוד/,
  /בע\s*["'״׳]?\s*מ/i,
  /\bltd\b/i,
  /\bllc\b/i,
  /גרופ/i,
  /\bgroup\b/i,
  /אחזקות/,
  /שירותי\s+ניהול/,
]

const MULTI_SITE_MARKERS = [
  /בניינים/,
  /מבנים/,
  /נכסים/,
  /מתחמ/,
  /מגדל/,
  /פורטפוליו/,
  /רשת/,
  /ארצ/,
  /מולטי/,
  /multi/i,
  /portfolio/i,
  /complex/i,
  /park/i,
  /campus/i,
]

/** Solo trades / consumer home service — wrong ICP for BINO sales. */
const SOLO_TRADE_MARKERS = [
  /אינסטלטור/,
  /שרברב/,
  /חשמלאי/,
  /צבעי/,
  /נגר/,
  /מנעולן/,
  /גנן/,
  /מדביר/,
  /זגג/,
  /הנדימן/,
  /שיפוצניק/,
  /plumber/i,
  /electrician/i,
  /locksmith/i,
  /handyman/i,
]

const RETAIL_MARKERS = [
  /חנות/,
  /אאוטלט/i,
  /חומרי\s*בניין/,
  /משתל/,
  /סופר/,
  /קניון/,
  /\bshowroom\b/i,
  /\boutlet\b/i,
]

function hasAny(res: RegExp[], label: string): boolean {
  return res.some((re) => re.test(label))
}

export type FitScoreInput = {
  name: string
  businessName?: string | null
  phone?: string | null
  websiteUrl?: string | null
  address?: string | null
  placeTypes?: string[] | null
  segmentSlug?: string | null
  searchAreaHint?: string | null
}

export function assessBuyerFit(input: FitScoreInput): FitAssessment {
  const reasons: string[] = []
  const label = `${input.name} ${input.businessName ?? ''}`.trim()
  const phoneKind = classifyPhoneKind(input.phone)
  const contactability: Contactability = phoneKind
  const types = (input.placeTypes ?? []).map((t) => t.toLowerCase())

  let score = 35
  let confidence = 30

  const solo = hasAny(SOLO_TRADE_MARKERS, label)
  const retail =
    hasAny(RETAIL_MARKERS, label) ||
    types.some((t) => /store|shop|shopping|hardware|supermarket/.test(t))
  const tradeType = types.some((t) =>
    /plumber|electrician|locksmith|painter|roofing|moving_company|car_repair|laundry/.test(t),
  )

  if ((solo || tradeType || retail) && !hasAny(ORG_BUYER_MARKERS, label)) {
    reasons.push(
      solo || tradeType ? 'solo_trade_not_platform_buyer' : 'retail_not_platform_buyer',
    )
    return {
      score: Math.max(0, score + BUYER_FIT_WEIGHTS.retailOrSoloTradePenalty),
      confidence: 80,
      fitClass: 'unsuitable',
      reasons,
      contactability,
      phoneKind,
      estimatedMrrIls: null,
    }
  }

  if (hasAny(ORG_BUYER_MARKERS, label) || types.some((t) => /real_estate|finance|local_government|courthouse/.test(t))) {
    score += BUYER_FIT_WEIGHTS.orgBuyerSignal
    confidence += 18
    reasons.push('org_buyer_signal')
  } else {
    reasons.push('org_signal_weak')
    confidence -= 5
  }

  if (hasAny(MULTI_SITE_MARKERS, label)) {
    score += BUYER_FIT_WEIGHTS.multiSiteSignal
    confidence += 12
    reasons.push('multi_site_signal')
  }

  if (input.segmentSlug) {
    score += BUYER_FIT_WEIGHTS.segmentMatch
    confidence += 8
    reasons.push(`segment_${input.segmentSlug}`)
  }

  if (input.phone?.trim()) {
    score += BUYER_FIT_WEIGHTS.evidencePhone
    confidence += 8
    reasons.push(`phone_${phoneKind}`)
  } else {
    reasons.push('phone_missing')
    confidence -= 8
  }

  if (input.websiteUrl?.trim()) {
    score += BUYER_FIT_WEIGHTS.evidenceWebsite
    confidence += 6
    reasons.push('has_website')
  }

  if (input.address?.trim()) {
    score += BUYER_FIT_WEIGHTS.evidenceAddress
    confidence += 4
    reasons.push('has_address')
  }

  if (input.searchAreaHint?.trim()) {
    score += BUYER_FIT_WEIGHTS.areaHint
    reasons.push('search_area_hint')
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  confidence = Math.max(0, Math.min(100, Math.round(confidence)))

  let fitClass: FitClass
  if (score >= 60 && confidence >= 40) fitClass = 'suitable'
  else if (score <= 25 && confidence >= 55) fitClass = 'unsuitable'
  else if (!input.phone?.trim() && !input.websiteUrl?.trim()) {
    fitClass = 'unknown'
    reasons.push('insufficient_evidence')
  } else {
    fitClass = 'needs_review'
  }

  const estimatedMrrIls =
    input.segmentSlug && SEGMENT_MRR_HINT[input.segmentSlug]
      ? SEGMENT_MRR_HINT[input.segmentSlug]
      : null

  return {
    score,
    confidence,
    fitClass,
    reasons,
    contactability,
    phoneKind,
    estimatedMrrIls,
  }
}

export function shouldKeepDiscoveredLead(input: FitScoreInput): boolean {
  const a = assessBuyerFit(input)
  if (a.fitClass === 'unsuitable') return false
  return Boolean(input.name?.trim())
}

export function fitClassLabelHe(fitClass: FitClass | null | undefined): string {
  switch (fitClass) {
    case 'suitable':
      return 'מתאים'
    case 'needs_review':
      return 'לבדיקה'
    case 'unsuitable':
      return 'לא מתאים'
    default:
      return 'לא ידוע'
  }
}

export function contactabilityLabelHe(c: Contactability | null | undefined): string {
  switch (c) {
    case 'mobile':
      return 'נייד'
    case 'landline':
      return 'קווי'
    case 'none':
      return 'אין טלפון'
    default:
      return 'לא ידוע'
  }
}

export function statusLabelHe(status: string): string {
  switch (status) {
    case 'discovered':
      return 'חדש'
    case 'qualified':
      return 'מסונן'
    case 'contacted':
      return 'פנו אליו'
    case 'demo_scheduled':
      return 'דמו נקבע'
    case 'won':
      return 'נסגר'
    case 'lost':
      return 'אבד'
    case 'rejected':
      return 'נדחה'
    case 'do_not_contact':
      return 'לא ליצור קשר'
    default:
      return status
  }
}
