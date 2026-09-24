import { fetchWithTimeout } from '@/lib/fetch-timeout'
import type { FixlyCreateJobRequest, FixlyCreateJobResponse } from '@/lib/fixly-types'
import { randomUUID } from 'crypto'

const FIXLY_TIMEOUT_MS = 20_000

export function isFixlyConfigured(): boolean {
  return Boolean((process.env.FIXLY_API_URL || '').trim() && (process.env.FIXLY_API_KEY || '').trim())
}

/**
 * Create an open Fixly job. When env is missing, returns a local stub id
 * so BINO can still record launch + accept webhook simulations.
 */
export async function createFixlyOpenJob(
  payload: FixlyCreateJobRequest
): Promise<{ ok: true; data: FixlyCreateJobResponse; stub: boolean } | { ok: false; error: string }> {
  const baseUrl = (process.env.FIXLY_API_URL || '').trim().replace(/\/$/, '')
  const apiKey = (process.env.FIXLY_API_KEY || '').trim()

  if (!baseUrl || !apiKey) {
    const stubId = `stub-${randomUUID()}`
    return {
      ok: true,
      stub: true,
      data: { fixly_job_id: stubId, status: 'open' },
    }
  }

  const res = await fetchWithTimeout(
    `${baseUrl}/v1/jobs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    FIXLY_TIMEOUT_MS
  )

  if (!res) {
    return { ok: false, error: 'Fixly לא הגיב בזמן' }
  }

  const json = (await res.json().catch(() => ({}))) as Partial<FixlyCreateJobResponse> & {
    error?: string
  }

  if (!res.ok || !json.fixly_job_id) {
    return { ok: false, error: json.error || `Fixly החזיר ${res.status}` }
  }

  return {
    ok: true,
    stub: false,
    data: {
      fixly_job_id: String(json.fixly_job_id),
      status: (json.status as FixlyCreateJobResponse['status']) || 'open',
    },
  }
}

export function authorizeFixlyWebhook(opts: {
  expectedSecret: string | undefined | null
  tokenFromQuery: string | null
  tokenFromHeader: string | null
}): boolean {
  const expected = (opts.expectedSecret || '').trim()
  if (!expected) return false
  const got = (opts.tokenFromQuery || opts.tokenFromHeader || '').trim()
  return got.length > 0 && got === expected
}
