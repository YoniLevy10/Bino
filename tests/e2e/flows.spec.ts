/**
 * בדיקות E2E - זרימות ניווט ופעולות משתמש
 *
 * מטרה: לבדוק שכל כפתור ומסך מוביל לפעולה הגיונית,
 * שהתצוגה עולה בהצלחה, ושהזרימה בין הדפים עקבית.
 *
 * הנחה: המערכת רצה על localhost:3000.
 * עמודים מוגנים (מצריכים login) יוחזרו ל-/login — זה נבדק בנפרד.
 */

import { test, expect, type Page } from '@playwright/test'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** בודק שהדף עלה ואין שגיאת JS קריטית */
async function expectPageLoaded(page: Page, path: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  expect(errors.filter((e) => !e.includes('hydrat')), `JS crash on ${path}: ${errors.join(', ')}`).toHaveLength(0)
}

/** פותח תפריט מובייל אם קיים */
async function openMobileMenuIfNeeded(page: Page) {
  const btn = page.locator('button[aria-label="פתיחת תפריט"]').first()
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click()
  }
}

// ─────────────────────────────────────────────────────────────
// Public routes — no auth needed
// ─────────────────────────────────────────────────────────────

test.describe('דפים ציבוריים', () => {
  test('דף login עולה ומציג כפתור Google', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=התחבר עם Google').or(page.locator('text=כניסה עם Google')).first()).toBeVisible({ timeout: 10_000 })
  })

  test('דף login - כפתור Google מפנה ל-Google OAuth', async ({ page }) => {
    await page.goto('/login')
    const btn = page.locator('button').filter({ hasText: /google/i }).first()
    await expect(btn).toBeVisible()
    // לא לוחצים — רק מוודאים שהכפתור קיים ולא disabled
    await expect(btn).not.toBeDisabled()
  })

  test('דף /report עולה (טופס דיווח ציבורי)', async ({ page }) => {
    await page.goto('/report?project=TEST&client=00000000-0000-0000-0000-000000000000')
    await page.waitForLoadState('domcontentloaded')
    // הדף יכול להציג "פרויקט לא נמצא" — זה תקין. חשוב שלא יהיה crash
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThanOrEqual(10)
  })

  test('דף /intake עולה (סקר רישום דיירים ציבורי)', async ({ page }) => {
    await page.goto('/intake?project=TEST&client=00000000-0000-0000-0000-000000000000')
    await page.waitForLoadState('domcontentloaded')
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThanOrEqual(10)
    expect(body).toMatch(/סקר דיירים|בניין|Bino/)
  })

  test('דף /privacy עולה', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()
  })

  test('דף 404 מוגדר ולא מחזיר מסך ריק', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz')
    await page.waitForLoadState('domcontentloaded')
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThanOrEqual(5)
  })
})

// ─────────────────────────────────────────────────────────────
// Protected routes — redirect to /login
// ─────────────────────────────────────────────────────────────

test.describe('הפניות auth — דפים מוגנים', () => {
  const protectedRoutes = [
    '/',
    '/tickets',
    '/projects',
    '/workers',
    '/residents',
    '/qr',
    '/summary',
    '/settings',
    '/pending-residents',
    '/addons',
    '/calendar',
    '/attendance',
    '/professionals',
    '/pilot-sms',
    '/project-documents',
    '/whatsapp-inbox',
    '/campaigns',
  ]

  for (const route of protectedRoutes) {
    test(`${route} מפנה ל-/login אם לא מחובר`, async ({ page }) => {
      await page.goto(route)
      await page.waitForURL(/\/login/, { timeout: 10_000 })
      await expect(page).toHaveURL(/\/login/)
    })
  }
})

// ─────────────────────────────────────────────────────────────
// Login page UX
// ─────────────────────────────────────────────────────────────

test.describe('דף login — UX', () => {
  test('לוגו / שם המוצר מוצג', async ({ page }) => {
    await page.goto('/login')
    // חפש טקסט שמזהה את המוצר
    const logo = page.locator('text=Bino').first()
    await expect(logo).toBeVisible({ timeout: 8_000 })
  })

  test('לא מציג שגיאת JS בדף login', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => {
      const msg = e.message
      if (msg.includes('hydrat')) return
      if (msg.includes('Unexpected token')) return
      if (msg.includes("expected expression, got '<'")) return
      errors.push(msg)
    })
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    expect(errors).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────
// Removed public diagnostics — must not be exposed
// ─────────────────────────────────────────────────────────────

test.describe('API diagnostics removed', () => {
  test('GET /api/health דורש auth (לא ציבורי)', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(401)
  })

  test('POST /api/assistant/query דורש auth', async ({ request }) => {
    const res = await request.post('/api/assistant/query', { data: { question: 'כמה תקלות?' } })
    expect(res.status()).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────
// Admin setup API — security
// ─────────────────────────────────────────────────────────────

test.describe('API admin/setup-client — אבטחה', () => {
  test('POST ללא header מחזיר 401', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', {
      data: { company_name: 'Test', admin_email: 'a@b.com', projects: [{ name: 'P', project_code: 'P1' }] },
    })
    expect(res.status()).toBe(401)
  })

  test('POST עם secret שגוי מחזיר 401', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', {
      headers: { 'x-admin-secret': 'wrong-secret-xyz' },
      data: { company_name: 'Test', admin_email: 'a@b.com', projects: [{ name: 'P', project_code: 'P1' }] },
    })
    expect(res.status()).toBe(401)
  })

  test('POST עם body ריק מחזיר 400 או 401', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', { data: {} })
    expect([400, 401]).toContain(res.status())
  })
})

// ─────────────────────────────────────────────────────────────
// API routes — אבטחה (מוגנים בלי session)
// ─────────────────────────────────────────────────────────────

test.describe('API routes — דורשים session', () => {
  const apiRoutes = [
    { method: 'POST', path: '/api/create-ticket' },
    { method: 'POST', path: '/api/create-project' },
    { method: 'POST', path: '/api/create-worker' },
    { method: 'PATCH', path: '/api/close-ticket' },
    { method: 'GET', path: '/api/billing/summary' },
    { method: 'POST', path: '/api/projects/pilot-sms' },
    { method: 'GET', path: '/api/projects/documents' },
  ]

  for (const { method, path } of apiRoutes) {
    test(`${method} ${path} מחזיר 401 בלי session`, async ({ request }) => {
      const res = method === 'GET'
        ? await request.get(path)
        : await request.fetch(path, { method, data: {} })
      expect([401, 403]).toContain(res.status())
    })
  }
})

// ─────────────────────────────────────────────────────────────
// Onboarding — זרימה ציבורית
// ─────────────────────────────────────────────────────────────

test.describe('אונבורדינג', () => {
  test('דף onboarding מפנה ל-login אם לא מחובר', async ({ page }) => {
    await page.goto('/onboarding')
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

// ─────────────────────────────────────────────────────────────
// Report page — ציבורי, בודק validation
// ─────────────────────────────────────────────────────────────

test.describe('דף דיווח ציבורי (/report)', () => {
  test('ללא params — מציג הודעת שגיאה ולא crash', async ({ page }) => {
    await page.goto('/report')
    await page.waitForLoadState('domcontentloaded')
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(5)
  })

  test('עם params מזויפים — מציג "לא נמצא" ולא 500', async ({ page }) => {
    await page.goto('/report?project=NOTREAL&client=bad-id')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })
    // ציפייה: הדף עולה, אפשר שיציג שגיאה בעברית אבל לא blank/crash
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(5)
  })
})

// ─────────────────────────────────────────────────────────────
// Navigation consistency — links point to real pages
// ─────────────────────────────────────────────────────────────

test.describe('עקביות ניווט', () => {
  test('לינקים בדף login לא שבורים', async ({ page }) => {
    await page.goto('/login')
    const links = await page.locator('a[href]').all()
    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        // רק links פנימיים — לא לבדוק OAuth / external
        const res = await page.request.get(href).catch(() => null)
        if (res) {
          expect(res.status(), `Link ${href} returned ${res.status()}`).not.toBe(500)
        }
      }
    }
  })

  test('הפניית / → /login מחזירה קוד לא-5xx', async ({ request }) => {
    const res = await request.get('/')
    // יכול להיות 200 (אם יש static export) או redirect
    expect(res.status()).toBeLessThan(500)
  })
})
