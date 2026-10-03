/**
 * Optional k6 script for public /login TTFB against a local BASE_URL.
 *
 * Requires k6: https://k6.io/docs/get-started/installation/
 *
 *   BASE_URL=http://127.0.0.1:3000 k6 run scripts/load/k6-login.js
 *
 * Safety: refuses bino.casa / supabase hosts (same policy as guard.mjs).
 */

import http from 'k6/http'
import { check, sleep } from 'k6'

const DEFAULT_BASE = 'http://127.0.0.1:3000'
const baseUrl = (__ENV.BASE_URL || DEFAULT_BASE).replace(/\/$/, '')

function assertSafeBaseUrl(url) {
  const lower = String(url).toLowerCase()
  if (lower.includes('bino.casa')) {
    throw new Error('HARD FAIL: BASE_URL targets bino.casa — refused always')
  }
  if (lower.includes('.supabase.co') || lower.includes('jsliqlmjksintyigkulq')) {
    if (__ENV.ALLOW_PROD_LOAD !== 'I_UNDERSTAND') {
      throw new Error(
        'HARD FAIL: BASE_URL looks like Supabase/Bamakor host. Use local only, or ALLOW_PROD_LOAD=I_UNDERSTAND (still refuses bino.casa).',
      )
    }
  }
}

assertSafeBaseUrl(baseUrl)

export const options = {
  vus: Number(__ENV.LOAD_VUS || 10),
  duration: __ENV.LOAD_DURATION || '15s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_waiting: ['p(95)<2000'],
  },
}

export default function () {
  const res = http.get(`${baseUrl}/login`)
  check(res, {
    'status is 200': (r) => r.status === 200,
  })
  sleep(0.3)
}
