/**
 * Bamakor agent test-gate smoke (read-only).
 *
 * Verifies the live production alias https://bamakor.vercel.app still behaves
 * as the agent test environment: browser paths redirect to bino.casa; webhook
 * and cron routes stay on the alias with expected auth gates (not 5xx).
 *
 * Usage:
 *   npm run test:bamakor-smoke
 *   BAMAKOR_SMOKE_BASE=https://bamakor.vercel.app npm run test:bamakor-smoke
 *
 * Does NOT load-test, write data, or call authenticated manager APIs.
 */

import { runBamakorSmoke } from './agent-bamakor-smoke-lib.mjs'

const base = (process.env.BAMAKOR_SMOKE_BASE || 'https://bamakor.vercel.app').replace(/\/$/, '')

const result = await runBamakorSmoke({ baseUrl: base, fetchImpl: fetch })

for (const line of result.lines) {
  console.log(line)
}

if (!result.ok) {
  console.error('\nBamakor smoke FAILED — fix before claiming the task done.')
  process.exit(1)
}

console.log('\nBamakor smoke PASSED.')
process.exit(0)
