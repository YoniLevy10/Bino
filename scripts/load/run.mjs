#!/usr/bin/env node
/**
 * Isolated BINO load harness (autocannon).
 *
 * Defaults BASE_URL=http://127.0.0.1:3000 and hard-fails on bino.casa /
 * Supabase project hosts (see guard.mjs).
 *
 * Usage:
 *   npm run load:isolated
 *   BASE_URL=http://127.0.0.1:3000 npm run load:isolated
 *   LOAD_AUTH_COOKIE='sb-...=...' npm run load:isolated
 *   LOAD_USE_AUTH_MOCK=1 npm run load:isolated
 *   LOAD_ALLOW_WRITES=1 LOAD_CLIENT_ID=a1111111-1111-4111-8111-111111111111 npm run load:isolated
 */

import { createRequire } from 'node:module'
import { resolveBaseUrlOrExit, assertWriteScenarioAllowed, SANDBOX_LOAD_CLIENT_ID } from './guard.mjs'
import { startMockAuthServer } from './mock-auth-server.mjs'

const require = createRequire(import.meta.url)

async function loadAutocannon() {
  try {
    return require('autocannon')
  } catch {
    console.error(
      '[load] autocannon not installed. Run: npm i -D autocannon\n' +
        'Or: npx autocannon (after installing once).',
    )
    process.exit(1)
  }
}

function envInt(name, fallback) {
  const v = process.env[name]
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * @param {Function} autocannon
 * @param {{ title: string, url: string, method?: string, headers?: Record<string,string>, body?: string, connections?: number, duration?: number, amount?: number }} opts
 */
function runOne(autocannon, opts) {
  const connections = opts.connections ?? envInt('LOAD_CONNECTIONS', 10)
  const duration = opts.duration ?? envInt('LOAD_DURATION_SEC', 10)
  const amount = opts.amount

  console.log(`\n=== ${opts.title} ===`)
  console.log(`${opts.method || 'GET'} ${opts.url}`)

  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: opts.url,
        method: opts.method || 'GET',
        headers: opts.headers,
        body: opts.body,
        connections,
        duration: amount ? undefined : duration,
        amount,
        timeout: envInt('LOAD_TIMEOUT_SEC', 20),
        excludeErrorStats: false,
      },
      (err, result) => {
        if (err) reject(err)
        else resolve(result)
      },
    )
    autocannon.track(instance, { renderProgressBar: true })
  })
}

function summarize(title, result) {
  const lat = result.latency || {}
  console.log(
    `[summary] ${title}: status2xx=${result['2xx'] ?? 0} ` +
      `non2xx=${result.non2xx ?? 0} errors=${result.errors ?? 0} ` +
      `rps=${(result.requests?.average ?? 0).toFixed?.(1) ?? result.requests?.average} ` +
      `ttfb_p50=${lat.p50 ?? lat.mean ?? 'n/a'}ms ttfb_p95=${lat.p95 ?? 'n/a'}ms ttfb_p99=${lat.p99 ?? 'n/a'}ms`,
  )
  return {
    title,
    '2xx': result['2xx'],
    non2xx: result.non2xx,
    errors: result.errors,
    requestsAverage: result.requests?.average,
    latencyP50: lat.p50 ?? lat.mean,
    latencyP95: lat.p95,
    latencyP99: lat.p99,
  }
}

async function main() {
  let baseUrl
  try {
    baseUrl = resolveBaseUrlOrExit(process.env)
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }

  console.log(`[load] BASE_URL=${baseUrl}`)
  console.log('[load] Production Bamakor / bino.casa load is forbidden by guard.')

  const autocannon = await loadAutocannon()
  /** @type {ReturnType<typeof summarize>[]} */
  const summaries = []
  /** @type {null | { baseUrl: string, close: () => Promise<void> }} */
  let mock = null

  try {
    // --- Scenario 1: public /login TTFB ---
    const loginResult = await runOne(autocannon, {
      title: 'public /login TTFB',
      url: `${baseUrl}/login`,
      connections: envInt('LOAD_LOGIN_CONNECTIONS', 10),
      duration: envInt('LOAD_LOGIN_DURATION_SEC', 10),
    })
    summaries.push(summarize('login', loginResult))

    // --- Scenario 2: authenticated dashboard APIs ---
    const authCookie = (process.env.LOAD_AUTH_COOKIE || '').trim()
    const useMock = (process.env.LOAD_USE_AUTH_MOCK || '').trim() === '1'

    if (authCookie) {
      const paths = (process.env.LOAD_AUTH_PATHS || '/api/health,/dashboard')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      for (const p of paths) {
        const title = `auth ${p}`
        const result = await runOne(autocannon, {
          title,
          url: `${baseUrl}${p.startsWith('/') ? p : `/${p}`}`,
          headers: { cookie: authCookie },
          connections: envInt('LOAD_AUTH_CONNECTIONS', 5),
          duration: envInt('LOAD_AUTH_DURATION_SEC', 8),
        })
        summaries.push(summarize(title, result))
      }
    } else if (useMock) {
      mock = await startMockAuthServer()
      console.log(`[load] auth APIs: using local mock at ${mock.baseUrl} (no production / no cookie)`)
      for (const p of ['/api/dashboard/summary', '/api/tickets/list', '/api/health']) {
        const title = `mock-auth ${p}`
        const result = await runOne(autocannon, {
          title,
          url: `${mock.baseUrl}${p}`,
          connections: envInt('LOAD_AUTH_CONNECTIONS', 20),
          duration: envInt('LOAD_AUTH_DURATION_SEC', 5),
        })
        summaries.push(summarize(title, result))
      }
    } else {
      console.log(
        '[load] auth dashboard APIs SKIPPED (set LOAD_AUTH_COOKIE for real local session, or LOAD_USE_AUTH_MOCK=1 for in-process mock).',
      )
    }

    // --- Scenario 3: public report create-ticket (writes) ---
    const clientId = (process.env.LOAD_CLIENT_ID || SANDBOX_LOAD_CLIENT_ID).trim()
    const writeGate = assertWriteScenarioAllowed({
      allowWrites: process.env.LOAD_ALLOW_WRITES,
      clientId,
    })
    if (!writeGate.ok) {
      console.log(`[load] create-ticket writes: ${writeGate.reason}`)
    } else {
      console.warn(
        '[load] WARNING: write scenario enabled. Use ONLY against local app + local DB. ' +
          'Sandbox client on production Bamakor DB must NOT be used for load.',
      )
      const projectCode = (process.env.LOAD_PROJECT_CODE || 'SANDBOX01').trim()
      const body = JSON.stringify({
        title: `load-test ${Date.now()}`,
        description: 'isolated load harness — safe to delete',
        priority: 'LOW',
        project_code: projectCode,
        client_id: clientId,
        source: 'load-harness',
        reporter_name: 'load-harness',
        reporter_phone: '0500000000',
      })
      const result = await runOne(autocannon, {
        title: 'public report POST /api/create-ticket',
        url: `${baseUrl}/api/create-ticket`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body,
        connections: envInt('LOAD_WRITE_CONNECTIONS', 2),
        duration: envInt('LOAD_WRITE_DURATION_SEC', 5),
      })
      summaries.push(summarize('create-ticket', result))
    }
  } finally {
    if (mock) await mock.close()
  }

  console.log('\n[load] done')
  console.log(JSON.stringify({ baseUrl, summaries }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
