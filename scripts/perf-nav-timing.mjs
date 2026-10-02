/**
 * One-shot manager nav timing against production (or PERF_BASE_URL).
 * Usage: DEMO_LOGIN_PASSWORD=... node scripts/perf-nav-timing.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.PERF_BASE_URL || 'https://bino.casa'
const EMAIL = process.env.DEMO_LOGIN_EMAIL || 'savion@bamakor.com'
const PASSWORD = process.env.DEMO_LOGIN_PASSWORD || 'savion2026!'

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

async function waitMeaningful(page, route) {
  const start = Date.now()
  await page.waitForLoadState('domcontentloaded')
  // Prefer table/card content over spinner-only
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
  return { route, tNav, tFull }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const rows = []

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // Email/password form
  const email = page.locator('input[type="email"], input[name="email"]').first()
  const password = page.locator('input[type="password"]').first()
  await email.waitFor({ timeout: 20000 })
  await email.fill(EMAIL)
  await password.fill(PASSWORD)
  await page.getByRole('button', { name: /התחבר|כניסה|Sign in|Login/i }).first().click()
  await page.waitForURL(/\/(dashboard|tickets|projects)/, { timeout: 60000 }).catch(() => null)

  if (page.url().includes('/login')) {
    console.error('LOGIN_FAILED', page.url())
    await page.screenshot({ path: '/opt/cursor/artifacts/perf-login-failed.png', fullPage: true })
    await browser.close()
    process.exit(1)
  }

  for (const route of ROUTES) {
    const t0 = Date.now()
    await page.goto(`${BASE}${route}`, { waitUntil: 'commit', timeout: 60000 })
    const timing = await waitMeaningful(page, route)
    timing.tNav = Math.max(timing.tNav, Date.now() - t0 - 400)
    rows.push(timing)
    console.log(`${route}\tT_nav=${timing.tNav}ms\tT_full=${timing.tFull}ms`)
  }

  // Detail timings
  async function detail(label, listRoute, clickSelector) {
    await page.goto(`${BASE}${listRoute}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await waitMeaningful(page, listRoute)
    const start = Date.now()
    const target = page.locator(clickSelector).first()
    if ((await target.count()) === 0) {
      console.log(`${label}\tT_detail=SKIP (no target)`)
      return
    }
    await target.click()
    await page.waitForTimeout(800)
    console.log(`${label}\tT_detail=${Date.now() - start}ms`)
  }

  await detail('worker-detail', '/workers', 'table tbody tr, [role="row"], button:has-text("פרטים")')
  await detail('resident-edit', '/residents', 'button:has-text("עריכה")')
  await detail('ticket-detail', '/tickets', 'table tbody tr, [data-ticket-id]')

  await browser.close()
  console.log(JSON.stringify(rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
