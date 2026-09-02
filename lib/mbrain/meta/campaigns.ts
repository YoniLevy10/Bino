/**
 * Meta campaign / ad set / ad operations — official Graph API + mock mode.
 */
import { getMetaGraphBaseUrl, getMetaMode, type MetaDataLabel, getMetaDataLabel } from './client'
import { mbrainLog } from '@/lib/mbrain/logging'

export type CreateCampaignInput = {
  adAccountId: string
  name: string
  objective: string
  status?: 'PAUSED' | 'ACTIVE'
  dailyBudgetMinorUnits?: number
  accessToken: string | null
  idempotencyKey: string
}

export type CreateCampaignResult = {
  label: MetaDataLabel
  metaCampaignId: string
  raw: Record<string, unknown>
}

function mockId(prefix: string, key: string): string {
  const hash = Array.from(key).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return `${prefix}_mock_${hash.toString(16)}`
}

export async function createMetaCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !input.accessToken) {
    return {
      label,
      metaCampaignId: mockId('camp', input.idempotencyKey),
      raw: { mock: true, name: input.name, objective: input.objective },
    }
  }

  const accountId = input.adAccountId.startsWith('act_')
    ? input.adAccountId
    : `act_${input.adAccountId}`
  const url = `${getMetaGraphBaseUrl()}/${accountId}/campaigns`
  const body = new URLSearchParams({
    name: input.name,
    objective: input.objective,
    status: input.status ?? 'PAUSED',
    special_ad_categories: '[]',
  })
  if (input.dailyBudgetMinorUnits != null) {
    body.set('daily_budget', String(input.dailyBudgetMinorUnits))
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !json.id) {
    mbrainLog('error', 'meta_create_campaign_failed', { status: res.status, error: json.error })
    throw new Error(json.error?.message || `Meta create campaign failed (${res.status})`)
  }
  return { label, metaCampaignId: json.id, raw: json as Record<string, unknown> }
}

export async function createMetaAdSet(opts: {
  adAccountId: string
  campaignId: string
  name: string
  dailyBudgetMinorUnits: number
  accessToken: string | null
  idempotencyKey: string
  targeting?: Record<string, unknown>
}): Promise<{ label: MetaDataLabel; metaAdSetId: string; raw: Record<string, unknown> }> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !opts.accessToken) {
    return {
      label,
      metaAdSetId: mockId('adset', opts.idempotencyKey),
      raw: { mock: true, campaignId: opts.campaignId },
    }
  }

  const accountId = opts.adAccountId.startsWith('act_') ? opts.adAccountId : `act_${opts.adAccountId}`
  const url = `${getMetaGraphBaseUrl()}/${accountId}/adsets`
  const body = new URLSearchParams({
    name: opts.name,
    campaign_id: opts.campaignId,
    daily_budget: String(opts.dailyBudgetMinorUnits),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LEAD_GENERATION',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    status: 'PAUSED',
    targeting: JSON.stringify(
      opts.targeting ?? {
        geo_locations: { countries: ['IL'] },
      }
    ),
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Meta create ad set failed (${res.status})`)
  }
  return { label, metaAdSetId: json.id, raw: json as Record<string, unknown> }
}

export async function createMetaAd(opts: {
  adAccountId: string
  adSetId: string
  name: string
  creativeId: string
  accessToken: string | null
  idempotencyKey: string
}): Promise<{ label: MetaDataLabel; metaAdId: string; raw: Record<string, unknown> }> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !opts.accessToken) {
    return {
      label,
      metaAdId: mockId('ad', opts.idempotencyKey),
      raw: { mock: true, creativeId: opts.creativeId },
    }
  }

  const accountId = opts.adAccountId.startsWith('act_') ? opts.adAccountId : `act_${opts.adAccountId}`
  const url = `${getMetaGraphBaseUrl()}/${accountId}/ads`
  const body = new URLSearchParams({
    name: opts.name,
    adset_id: opts.adSetId,
    status: 'PAUSED',
    creative: JSON.stringify({ creative_id: opts.creativeId }),
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Meta create ad failed (${res.status})`)
  }
  return { label, metaAdId: json.id, raw: json as Record<string, unknown> }
}

export async function setMetaCampaignStatus(opts: {
  campaignId: string
  status: 'ACTIVE' | 'PAUSED'
  accessToken: string | null
}): Promise<{ label: MetaDataLabel; ok: boolean }> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !opts.accessToken) {
    return { label, ok: true }
  }
  const url = `${getMetaGraphBaseUrl()}/${opts.campaignId}`
  const body = new URLSearchParams({ status: opts.status })
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(json.error?.message || `Meta status update failed (${res.status})`)
  }
  return { label, ok: true }
}

/** ILS major units → Meta minor (agorot) assuming ILS*100 when currency is ILS. */
export function toMetaBudgetMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100)
}
