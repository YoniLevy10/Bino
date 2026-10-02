/**
 * Manager nav timing against production (or PERF_BASE_URL).
 *
 * Required env:
 *   DEMO_LOGIN_EMAIL
 *   DEMO_LOGIN_PASSWORD
 *
 * Optional:
 *   PERF_BASE_URL (default https://bino.casa)
 *   PERF_OUT_DIR (default /opt/cursor/artifacts)
 *   PERF_LABEL (default baseline)
 *
 * Usage:
 *   DEMO_LOGIN_EMAIL=... DEMO_LOGIN_PASSWORD=... node scripts/perf-nav-timing.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.PERF_BASE_URL || 'https://bino.casa'
const EMAIL = process.env.DEMO_LOGIN_EMAIL
const PASSWORD = process.env.DEMO_LOGIN_PASSWORD
const OUT_DIR = process.env.PERF_OUT_DIR || '/opt/cursor/artifacts'
const LABEL = process.env.PERF_LABEL || 'baseline'

if (!EMAIL || !PASSWORD) {
  console.error('Missing DEMO_LOGIN_EMAIL or DEMO_LOGIN_PASSWORD (required; no defaults).')
  process.exit(1)
}

const ROUTES = [
  '/dashboard',
  '/tickets',
  '/projects',
  '/residents',
  '/workers',
  '/tasks',
  '/site-tours',
  '/summary',
  '/settings',
  '/addons',
]

function createNetworkTracker(page) {
  /** @type {{ url: string, method: string, status: number, ms: number, type: string }[]} */
  const requests = []
  /** @type {Map<string, { url: string, method: string, start: number, type: string }>} */
  const pending = new Map()

  page.on('request', (req) => {
    const url = req.url()
    if (!/\/(api|rest\/v1|auth\/v1)\b/.test(url) && !url.includes('supabase')) return
    pending.set(req.url() + '|' + req.method(), {
      url,
      method: req.method(),
      start: Date.now(),
      type: req.resourceType(),
    })
  })

  page.on('response', async (res) => {
    const req = res.request()
    const key = req.url() + '|' + req.method()
    const started = pending.get(key)
    if (!started) return
    pending.delete(key)
    requests.push({
      url: started.url.split('?')[0],
      method: started.method,
      status: res.status(),
      ms: Date.now() - started.start,
      type: started.type,
    })
  })

  return {
    reset() {
      requests.length = 0
      pending.clear()
    },
    snapshot() {
      const sorted = [...requests].sort((a, b) => b.ms - a.ms)
      return {
        count: sorted.length,
        slowest: sorted[0] || null,
        top5: sorted.slice(0, 5),
      }
    },
  }
}

async function waitMeaningful(page) {
  const start = Date.now()
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  try {
    await page.waitForFunction(
      () => {
        const text = document.body?.innerText || ''
        const spinning = text.includes('טוען') && text.length < 80
        return !spinning && text.length > 120
      },
      { timeout: 45000 }
    )
  } catch {
    /* keep elapsed even on timeout */
  }
  const tNav = Date.now() - start
  await page.waitForTimeout(400)
  const tFull = Date.now() - start
  return { tNav, tFull }
}

async function clickNav(page, href) {
  const link = page.locator(`a[href="${href}"], a[href="${href}/"]`).first()
  if ((await link.count()) > 0) {
    await link.click()
    return true
  }
  // Fallback: client navigation via location
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, href)
  await page.goto(`${BASE}${href}`, { waitUntil: 'commit', timeout: 60000 })
  return false
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
  const page = await context.newPage()
  const net = createNetworkTracker(page)

  const report = {
    label: LABEL,
    base: BASE,
    email: EMAIL.replace(/(.{2}).+(@.+)/, '$1***$2'),
    startedAt: new Date().toISOString(),
    coldRoutes: [],
    warmJourneys: [],
    details: [],
    classificationHints: [],
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const email = page.locator('input[type="email"], input[name="email"]').first()
  const password = page.locator('input[type="password"]').first()
  await email.waitFor({ timeout: 20000 })
  await email.fill(EMAIL)
  await password.fill(PASSWORD)
  await page.getByRole('button', { name: /התחבר|כניסה|Sign in|Login/i }).first().click()
  await page.waitForURL(/\/(dashboard|tickets|projects)/, { timeout: 60000 }).catch(() => null)

  if (page.url().includes('/login')) {
    console.error('LOGIN_FAILED', page.url())
    await page.screenshot({ path: join(OUT_DIR, `perf-login-failed-${LABEL}.png`), fullPage: true })
    await context.tracing.stop({ path: join(OUT_DIR, `perf-trace-${LABEL}-login-failed.zip`) })
    await browser.close()
    process.exit(1)
  }

  // Cold-ish full navigations (page.goto)
  for (const route of ROUTES) {
    net.reset()
    const t0 = Date.now()
    await page.goto(`${BASE}${route}`, { waitUntil: 'commit', timeout: 60000 })
    const timing = await waitMeaningful(page)
    const network = net.snapshot()
    const row = {
      route,
      mode: 'goto',
      tNav: Math.max(timing.tNav, Date.now() - t0 - 400),
      tFull: timing.tFull,
      network,
    }
    report.coldRoutes.push(row)
    console.log(
      `${route}\tT_nav=${row.tNav}ms\tT_full=${row.tFull}ms\treqs=${network.count}\tslowest=${network.slowest?.ms ?? '-'}ms ${network.slowest?.url ?? ''}`
    )
  }

  // Warm client-side journeys (required)
  async function warmJourney(name, from, to) {
    await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await waitMeaningful(page)
    // First pass warms caches
    net.reset()
    await clickNav(page, to)
    await waitMeaningful(page)
    // Second pass = warm
    await clickNav(page, from)
    await waitMeaningful(page)
    net.reset()
    const t0 = Date.now()
    await clickNav(page, to)
    const timing = await waitMeaningful(page)
    const network = net.snapshot()
    const row = {
      name,
      from,
      to,
      mode: 'warm-click',
      tNav: Math.max(timing.tNav, Date.now() - t0 - 400),
      tFull: timing.tFull,
      network,
    }
    report.warmJourneys.push(row)
    console.log(
      `WARM ${name}\tT_nav=${row.tNav}ms\tT_full=${row.tFull}ms\treqs=${network.count}\tslowest=${network.slowest?.ms ?? '-'}ms ${network.slowest?.url ?? ''}`
    )
  }

  await warmJourney('dashboard→tickets', '/dashboard', '/tickets')
  await warmJourney('tickets→settings', '/tickets', '/settings')

  // Detail timings
  async function detail(label, listRoute, clickSelector) {
    await page.goto(`${BASE}${listRoute}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await waitMeaningful(page)
    net.reset()
    const target = page.locator(clickSelector).first()
    if ((await target.count()) === 0) {
      const skip = { label, listRoute, tDetail: null, skipped: true, network: net.snapshot() }
      report.details.push(skip)
      console.log(`${label}\tT_detail=SKIP (no target)`)
      return
    }
    const start = Date.now()
    await target.click()
    // Wait for drawer/modal content
    try {
      await page.waitForFunction(
        () => {
          const dialogs = document.querySelectorAll('[role="dialog"], [data-ticket-drawer], aside, [class*="drawer"]')
          return dialogs.length > 0 || document.body.innerText.length > 200
        },
        { timeout: 15000 }
      )
    } catch {
      /* ignore */
    }
    await page.waitForTimeout(600)
    const network = net.snapshot()
    const row = {
      label,
      listRoute,
      tDetail: Date.now() - start,
      skipped: false,
      network,
    }
    report.details.push(row)
    console.log(
      `${label}\tT_detail=${row.tDetail}ms\treqs=${network.count}\tslowest=${network.slowest?.ms ?? '-'}ms ${network.slowest?.url ?? ''}`
    )
  }

  await detail('ticket-detail', '/tickets', 'table tbody tr, [data-ticket-id], [data-testid="ticket-row"]')
  await detail('worker-detail', '/workers', 'table tbody tr, [role="row"], button:has-text("פרטים")')
  await detail('resident-edit', '/residents', 'button:has-text("עריכה")')

  // Lightweight classification hints from measurements
  for (const j of report.warmJourneys) {
    const slow = j.network?.slowest
    if (j.tNav > 800 && (!slow || slow.ms < 200)) {
      report.classificationHints.push({
        journey: j.name,
        class: 'react-remount|list-render',
        reason: `Warm T_nav=${j.tNav}ms with slowest API ${slow?.ms ?? 0}ms`,
      })
    } else if (slow && slow.ms >= 400) {
      report.classificationHints.push({
        journey: j.name,
        class: 'network|db',
        reason: `Slowest ${slow.ms}ms ${slow.url}`,
      })
    }
  }

  report.finishedAt = new Date().toISOString()
  const jsonPath = join(OUT_DIR, `perf-${LABEL}.json`)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  await context.tracing.stop({ path: join(OUT_DIR, `perf-trace-${LABEL}.zip`) })
  await browser.close()

  console.log('WROTE', jsonPath)
  console.log(JSON.stringify({ warmJourneys: report.warmJourneys, details: report.details, hints: report.classificationHints }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
