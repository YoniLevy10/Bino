import type { NormalizedBankTransaction } from '@/lib/bank-match/types'
import type { ScraperPullResult } from '@/lib/bank-match/scraper-adapter'
import { normalizeScraperCredentials } from '@/lib/bank-match/scraper-credentials-normalize'
import { fetchWithTimeout } from '@/lib/shared/fetch-timeout'

export function getScraperWorkerUrl(): string | null {
  const raw = (process.env.BUILDING_BANK_SCRAPER_WORKER_URL || '').trim()
  return raw ? raw.replace(/\/$/, '') : null
}

export function getScraperWorkerSecret(): string | null {
  const s = (
    process.env.BUILDING_BANK_SCRAPER_WORKER_SECRET ||
    process.env.CRON_SECRET ||
    ''
  ).trim()
  return s || null
}

/** Prefer remote worker when URL is set — enables scrape from Vercel. */
export function shouldUseScraperWorker(): boolean {
  return Boolean(getScraperWorkerUrl() && getScraperWorkerSecret())
}

async function workerFetch(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const base = getScraperWorkerUrl()
  const secret = getScraperWorkerSecret()
  if (!base || !secret) {
    return { ok: false, status: 503, json: { error: 'worker not configured' } }
  }
  const res = await fetchWithTimeout(
    `${base}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  )
  if (!res) {
    return { ok: false, status: 504, json: { error: 'worker timeout / unreachable' } }
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, json }
}

export async function scrapeViaWorker(params: {
  projectId: string
  provider: string
  credentials: Record<string, string>
  startDate?: Date
}): Promise<ScraperPullResult> {
  const result = await workerFetch(
    '/scrape',
    {
      projectId: params.projectId,
      provider: params.provider,
      credentials: normalizeScraperCredentials(params.provider, params.credentials),
      startDate: params.startDate?.toISOString(),
    },
    5 * 60_000
  )
  if (!result.ok) {
    return {
      ok: false,
      error: String(result.json.error || `worker HTTP ${result.status}`),
      code: 'SCRAPE_FAILED',
    }
  }
  const rows = Array.isArray(result.json.rows)
    ? (result.json.rows as NormalizedBankTransaction[])
    : []
  return { ok: true, rows, mode: 'live' }
}

export async function submitOtpToWorker(params: {
  projectId: string
  otpCode: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await workerFetch(
    '/otp',
    { projectId: params.projectId, otp_code: params.otpCode },
    15_000
  )
  if (!result.ok) {
    return { ok: false, error: String(result.json.error || 'שליחת OTP ל־worker נכשלה') }
  }
  return { ok: true }
}
