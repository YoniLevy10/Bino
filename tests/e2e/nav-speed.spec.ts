/**
 * Screen-to-screen speed for the manager shell.
 *
 *   npm run test:e2e:speed
 *
 * Needs DEMO_LOGIN_PASSWORD (and optionally DEMO_LOGIN_EMAIL) in the environment
 * or .env.local. Logs into the local production server on :3010, then walks the
 * operational screens. Does not target bino.casa.
 *
 * Two passes:
 * - click: sidebar navigation, the way a manager moves between screens
 * - reload: full document load with the HTTP cache off
 *
 * readyMs is click/navigation start until the screen's data marker is visible
 * and in-flight data requests have finished. Slow rows are printed. The run
 * fails on a broken screen (marker never appears). It fails on slowness only
 * when E2E_SPEED_STRICT=1.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page, type Request } from '@playwright/test'

const CLICK_READY_MS = 2_000
const RELOAD_READY_MS = 3_500
const READY_TIMEOUT_MS = 20_000
const QUIET_MS = 250

type Kind = 'login' | 'click' | 'reload' | 'detail'

type Hit = { path: string; ms: number; status: number }

type Row = {
  kind: Kind
  screen: string
  navMs: number | null
  readyMs: number | null
  ttfbMs: number | null
  requests: number
  slowestMs: number | null
  slowestPath: string | null
  note: string
}

type Screen = {
  href: string
  label: string
  marker: (page: Page) => Locator
}

const SCREENS: Screen[] = [
  {
    href: '/dashboard',
    label: 'לוח בקרה',
    marker: (page) =>
      page
        .getByText('תקלות פעילות', { exact: true })
        .or(page.getByText('לא הצלחנו לטעון את לוח הבקרה', { exact: true })),
  },
  {
    href: '/tasks',
    label: 'משימות',
    marker: (page) =>
      page
        .getByRole('button', { name: /סמן כהושלם|פתח מחדש/ })
        .or(page.getByText('אין משימות להצגה', { exact: true })),
  },
  {
    href: '/tickets',
    label: 'תקלות',
    marker: (page) =>
      page
        .getByRole('button', { name: /פתח תקלה/ })
        .or(page.locator('th', { hasText: 'תיאור' }))
        .or(page.getByText('לא נמצאו תקלות', { exact: true }))
        .or(page.getByText('לא הצלחנו לטעון את התקלות', { exact: true })),
  },
  {
    href: '/projects',
    label: 'פרויקטים',
    marker: (page) =>
      page
        .getByPlaceholder('חיפוש פרויקטים...')
        .or(page.getByText('לא הצלחנו לטעון פרויקטים', { exact: true }))
        .or(page.getByText('לא נמצאו פרויקטים', { exact: true })),
  },
  {
    href: '/residents',
    label: 'דיירים',
    marker: (page) =>
      page
        .getByRole('columnheader', { name: 'טלפון' })
        .or(page.getByText('אין דיירים להצגה.', { exact: true }))
        .or(page.getByText('לא הצלחנו לטעון את הדיירים', { exact: true }))
        .or(page.getByText('טבלת הדיירים עדיין לא הוגדרה', { exact: true })),
  },
  {
    href: '/workers',
    label: 'עובדים',
    marker: (page) =>
      page
        .getByPlaceholder('חיפוש לפי שם, טלפון, תפקיד...')
        .or(page.getByText('לא הצלחנו לטעון את העובדים', { exact: true }))
        .or(page.getByText('לא נמצאו עובדים', { exact: true })),
  },
  {
    href: '/summary',
    label: 'סיכום',
    marker: (page) =>
      page
        .getByText('בריאות המערכת', { exact: true })
        .or(page.getByText('לא הצלחנו לטעון את הסיכום', { exact: true })),
  },
]

function readLocalEnv(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim()
  if (fromProcess) return fromProcess
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return undefined
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).replace(/^export\s+/, '')
    if (key !== name) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value || undefined
  }
  return undefined
}

function isDataRequest(raw: string): boolean {
  if (/sentry|googletagmanager|google-analytics|speed-insights|vercel-insights|\/_next\/static|\/_next\/image|favicon/i.test(raw)) {
    return false
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.searchParams.has('_rsc')) return true
  if (url.pathname.startsWith('/api/')) {
    if (/analytics|page-view|vitals|web-vitals/i.test(url.pathname)) return false
    return true
  }
  return url.pathname.includes('/rest/v1/')
}

function shortPath(raw: string): string {
  try {
    const url = new URL(raw)
    const rest = url.pathname.indexOf('/rest/v1/')
    if (rest >= 0) return url.pathname.slice(rest)
    if (url.pathname.startsWith('/api/')) return url.pathname
    if (url.searchParams.has('_rsc')) return `${url.pathname} (rsc)`
    return url.pathname
  } catch {
    return raw
  }
}

function attachTracker(page: Page) {
  const state: { hits: Hit[]; inflight: number; lastDone: number } = {
    hits: [],
    inflight: 0,
    lastDone: 0,
  }
  const started = new Map<Request, number>()

  page.on('request', (req) => {
    if (!isDataRequest(req.url())) return
    started.set(req, Date.now())
    state.inflight += 1
  })
  page.on('response', (res) => {
    const t0 = started.get(res.request())
    if (t0 == null) return
    started.delete(res.request())
    state.inflight = Math.max(0, state.inflight - 1)
    state.lastDone = Date.now()
    state.hits.push({
      path: shortPath(res.url()),
      ms: Date.now() - t0,
      status: res.status(),
    })
  })
  page.on('requestfailed', (req) => {
    if (!started.has(req)) return
    started.delete(req)
    state.inflight = Math.max(0, state.inflight - 1)
    state.lastDone = Date.now()
  })

  return state
}

async function drain(page: Page, state: { inflight: number }) {
  const start = Date.now()
  while (state.inflight > 0 && Date.now() - start < 5_000) {
    await page.waitForTimeout(40)
  }
}

async function waitUntilQuiet(
  page: Page,
  state: { inflight: number; lastDone: number; hits: Hit[] },
  startedAt: number,
) {
  if (state.hits.length === 0) return
  const deadline = startedAt + READY_TIMEOUT_MS
  while (state.inflight > 0 && Date.now() < deadline) {
    await page.waitForTimeout(40)
  }
  while (Date.now() - state.lastDone < QUIET_MS && Date.now() < deadline) {
    await page.waitForTimeout(40)
  }
}

function slowest(hits: Hit[]): Hit | null {
  let best: Hit | null = null
  for (const hit of hits) {
    if (!best || hit.ms > best.ms) best = hit
  }
  return best
}

function assertLocal(baseURL: string | undefined) {
  const host = baseURL || ''
  if (/bino\.casa|bamakor\.vercel\.app/i.test(host)) {
    throw new Error(`nav-speed refuses ${host}`)
  }
}

async function measure(
  page: Page,
  state: { hits: Hit[]; inflight: number; lastDone: number },
  kind: Kind,
  screen: string,
  marker: Locator,
  navigate: () => Promise<void>,
): Promise<Row> {
  await drain(page, state)
  state.hits = []
  const t0 = Date.now()
  await navigate()
  const navMs = Date.now() - t0
  await expect(marker.first()).toBeVisible({ timeout: READY_TIMEOUT_MS })
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: READY_TIMEOUT_MS })
  await waitUntilQuiet(page, state, t0)
  const readyMs = Date.now() - t0
  const top = slowest(state.hits)
  const failed = state.hits.filter((hit) => hit.status >= 400).length
  const row: Row = {
    kind,
    screen,
    navMs,
    readyMs,
    ttfbMs: null,
    requests: state.hits.length,
    slowestMs: top?.ms ?? null,
    slowestPath: top?.path ?? null,
    note: failed > 0 ? `${failed} בקשות נכשלו` : '',
  }
  console.log(
    `${row.kind} ${row.screen} nav=${row.navMs}ms ready=${row.readyMs}ms reqs=${row.requests} slow=${row.slowestMs ?? '—'}ms ${row.slowestPath ?? ''} ${row.note}`.trim(),
  )
  return row
}

function budgetFor(kind: Kind): number | null {
  if (kind === 'click' || kind === 'detail') return CLICK_READY_MS
  if (kind === 'reload') return RELOAD_READY_MS
  return null
}

function flag(row: Row): string {
  const budget = budgetFor(row.kind)
  if (budget != null && row.readyMs != null && row.readyMs > budget) return 'איטי'
  return ''
}

function printReport(rows: Row[]) {
  const header = ['סוג', 'מסך', 'ניווט', 'נתונים', 'בקשות', 'איטית', 'נתיב', '']
  const lines = rows.map((row) => [
    row.kind,
    row.screen,
    row.navMs == null ? '—' : `${row.navMs}ms`,
    row.readyMs == null ? '—' : `${row.readyMs}ms`,
    String(row.requests),
    row.slowestMs == null ? '—' : `${row.slowestMs}ms`,
    row.slowestPath || row.note || '—',
    flag(row),
  ])
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...lines.map((line) => line[index].length)),
  )
  const fmt = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ')
  console.log('\nמדידת מהירות בין מסכים')
  console.log(fmt(header))
  for (const line of lines) console.log(fmt(line))
  const slow = rows.filter((row) => flag(row) === 'איטי')
  if (slow.length === 0) {
    console.log(`\nכל המעברים בתוך הסף (לחיצה ${CLICK_READY_MS}ms, טעינה מלאה ${RELOAD_READY_MS}ms).`)
  } else {
    console.log('\nמעל הסף:')
    for (const row of slow) {
      console.log(`- ${row.kind} ${row.screen}: ${row.readyMs}ms`)
    }
  }
}

test.use({ trace: 'retain-on-failure' })

test.describe('מהירות מעבר בין מסכים', () => {
  test.skip(process.env.E2E_SPEED !== '1', 'הריצו npm run test:e2e:speed')
  test.skip(({ browserName }) => browserName !== 'chromium', 'מדידת מהירות רצה על Chromium')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(240_000)

  test('לחיצה וטעינה מלאה של מסכי התפעול', async ({ page, baseURL }) => {
    assertLocal(baseURL)
    const email = readLocalEnv('DEMO_LOGIN_EMAIL') || 'savion@bamakor.com'
    const password = readLocalEnv('DEMO_LOGIN_PASSWORD')
    expect(password, 'חסרה DEMO_LOGIN_PASSWORD ב-.env.local או בסביבה').toBeTruthy()

    const state = attachTracker(page)
    const rows: Row[] = []

    await page.goto('/login')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(password!)
    const login = await measure(
      page,
      state,
      'login',
      'התחברות → לוח בקרה',
      SCREENS[0].marker(page),
      async () => {
        await page.getByRole('button', { name: 'התחברות' }).click()
        try {
          await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 30_000 })
        } catch {
          const alert = (await page.locator('#login-error').textContent().catch(() => ''))?.trim()
          throw new Error(alert || `אחרי התחברות הגענו ל-${page.url()} ולא ל-/dashboard`)
        }
      },
    )
    rows.push(login)

    const clickOrder = [
      SCREENS[1],
      SCREENS[2],
      SCREENS[3],
      SCREENS[4],
      SCREENS[5],
      SCREENS[6],
      SCREENS[0],
    ]

    for (const screen of clickOrder) {
      const link = page.locator(`aside.lg-sidebar a[href="${screen.href}"]`)
      if ((await link.count()) === 0) {
        rows.push({
          kind: 'click',
          screen: screen.label,
          navMs: null,
          readyMs: null,
          ttfbMs: null,
          requests: 0,
          slowestMs: null,
          slowestPath: null,
          note: 'הקישור לא בתפריט',
        })
        continue
      }
      rows.push(
        await measure(page, state, 'click', screen.label, screen.marker(page), async () => {
          await link.first().click()
          await page.waitForURL((url) => url.pathname === screen.href, {
            timeout: 15_000,
            waitUntil: 'commit',
          })
        }),
      )

      if (screen.href === '/tickets') {
        const row = page.getByRole('button', { name: /פתח תקלה/ }).first()
        if ((await row.count()) === 0) {
          rows.push({
            kind: 'detail',
            screen: 'פרטי תקלה',
            navMs: null,
            readyMs: null,
            ttfbMs: null,
            requests: 0,
            slowestMs: null,
            slowestPath: null,
            note: 'אין שורת תקלה ללחיצה',
          })
        } else {
          rows.push(
            await measure(
              page,
              state,
              'detail',
              'פרטי תקלה',
              page.getByRole('heading', { name: /תקלה #\d+/ }),
              async () => {
                await row.click()
              },
            ),
          )
          await page.goto('/tickets', { waitUntil: 'domcontentloaded' })
          await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 })
        }
      }
    }

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

    for (const screen of SCREENS) {
      const row = await measure(page, state, 'reload', screen.label, screen.marker(page), async () => {
        await page.goto(screen.href, { waitUntil: 'domcontentloaded' })
      })
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        return nav ? Math.round(nav.responseStart) : null
      })
      row.ttfbMs = timing
      rows.push(row)
    }

    printReport(rows)

    mkdirSync(resolve(process.cwd(), 'test-results'), { recursive: true })
    const reportPath = resolve(process.cwd(), 'test-results/nav-speed.json')
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          baseURL,
          email,
          budgets: { clickReadyMs: CLICK_READY_MS, reloadReadyMs: RELOAD_READY_MS },
          rows,
        },
        null,
        2,
      ),
    )
    console.log(`\nנשמר ${reportPath}`)

    if (process.env.E2E_SPEED_STRICT === '1') {
      const slow = rows.filter((row) => flag(row) === 'איטי').map((row) => `${row.kind} ${row.screen} ${row.readyMs}ms`)
      expect(slow, slow.join('\n')).toEqual([])
    }
  })
})
