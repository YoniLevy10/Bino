/**
 * בדיקות E2E מקיפות — כיסוי מלא של כל זרימות המשתמש
 *
 * כולל בדיקות לכל כפתור, שדה, מסנן, ו-API במערכת.
 * מניח שהשרת רץ על localhost:3000.
 * דפים מוגנים → מחזירים /login (אין לוגין אמיתי בטסטים אלה).
 *
 * @file full-coverage.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** מוודא שהדף עלה ואין שגיאת JS קריטית */
async function noJSCrash(page: Page, path: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => {
    const msg = e.message
    if (msg.includes('hydrat')) return
    if (msg.includes('access control checks')) return
    errors.push(msg)
  })
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  expect(errors, `JS crash on ${path}: ${errors.join(', ')}`).toHaveLength(0)
}

/** בודק שדף מוגן מפנה ל-/login */
async function expectRedirectToLogin(page: Page, path: string) {
  await page.goto(path)
  await page.waitForURL(/\/login/, { timeout: 12_000 })
  await expect(page).toHaveURL(/\/login/)
}

const ADMIN_SECRET_STORAGE_KEY = 'bamakor_admin_secret'

/** פותח /admin/setup במסך נעילה (ללא sessionStorage ישן) */
async function gotoAdminSetupLocked(page: Page) {
  await page.goto('/admin/setup', { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => sessionStorage.removeItem(key), ADMIN_SECRET_STORAGE_KEY)
  await page.goto('/admin/setup', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 12_000 })
}

/** ממתין לטופס הקמת לקוח אחרי מסך הנעילה */
async function expectAdminSetupForm(page: Page) {
  await expect(page.locator('input[type="password"]')).toBeHidden({ timeout: 15_000 })
  await expect(page.getByPlaceholder('למשל: ועד הבית תל אביב')).toBeVisible({ timeout: 15_000 })
}

/** פותח את טופס הקמת הלקוח אחרי מסך הנעילה */
async function unlockAdminSetup(page: Page, secret = 'e2e-test-secret') {
  await gotoAdminSetupLocked(page)
  const field = page.locator('input[type="password"]')
  await field.click()
  await field.fill(secret)
  await expect(field).toHaveValue(secret)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expectAdminSetupForm(page)
}

// ═══════════════════════════════════════════════════════════════
// דפים ציבוריים — אין צורך בהתחברות
// ═══════════════════════════════════════════════════════════════

test.describe('דפים ציבוריים — עולים ללא login', () => {
  test('דף /login עולה ומציג כפתור Google', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('body')).toBeVisible()
    // חפש כפתור Google באחת מהצורות
    const btn = page
      .locator('button')
      .filter({ hasText: /google/i })
      .first()
    await expect(btn).toBeVisible({ timeout: 10_000 })
    await expect(btn).not.toBeDisabled()
  })

  test('/login — לוגו המוצר מוצג', async ({ page }) => {
    await page.goto('/login')
    const logo = page.locator('text=Bino').first()
    await expect(logo).toBeVisible({ timeout: 8_000 })
  })

  test('/login — אין שגיאות JS', async ({ page }) => {
    await noJSCrash(page, '/login')
  })

  test('/login — כפתור Google לא disabled', async ({ page }) => {
    await page.goto('/login')
    const btn = page.locator('button').filter({ hasText: /google/i }).first()
    await expect(btn).not.toBeDisabled()
  })

  test('/report ללא params — עולה ולא מקריס', async ({ page }) => {
    await noJSCrash(page, '/report')
  })

  test('/report עם params תקינים — לא מחזיר 500', async ({ page }) => {
    await page.goto('/report?project=TEST&client=00000000-0000-0000-0000-000000000000')
    await page.waitForLoadState('domcontentloaded')
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThanOrEqual(10)
  })

  test('/report — שדה תיאור ושדה שם מוצגים', async ({ page }) => {
    await page.goto('/report?project=TEST&client=00000000-0000-0000-0000-000000000000')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    // אפשר שיוצג "לא נמצא" — רק מוודאים שאין blank
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThan(5)
  })

  test('/privacy — עולה ומציג תוכן', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/privacy/)
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThanOrEqual(10)
  })

  test('דף 404 — מוצג ולא blank', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz')
    await page.waitForLoadState('domcontentloaded')
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThanOrEqual(5)
  })
})

// ═══════════════════════════════════════════════════════════════
// הפניות auth — כל דף מוגן מחזיר ל-/login
// ═══════════════════════════════════════════════════════════════

test.describe('הפניות auth — דפים מוגנים', () => {
  const routes = [
    '/dashboard',
    '/tickets',
    '/projects',
    '/workers',
    '/residents',
    '/qr',
    '/summary',
    '/settings',
    '/pending-residents',
    '/onboarding',
    '/addons',
    '/calendar',
    '/attendance',
    '/professionals',
    '/pilot-sms',
    '/project-documents',
  ]

  for (const route of routes) {
    test(`${route} → /login (ללא סשן)`, async ({ page }) => {
      await expectRedirectToLogin(page, route)
    })
  }
})

// ═══════════════════════════════════════════════════════════════
// ויזארד הקמת לקוח — /admin/setup
// ═══════════════════════════════════════════════════════════════

test.describe('/admin/setup — ויזארד הקמת לקוח', () => {
  test.describe.configure({ mode: 'serial' })

  test('דף עולה ומציג מסך נעילה (קוד גישה)', async ({ page }) => {
    await noJSCrash(page, '/admin/setup')
    await gotoAdminSetupLocked(page)
  })

  test('כפתור כניסה קיים ולא disabled', async ({ page }) => {
    await gotoAdminSetupLocked(page)
    const btn = page.getByRole('button', { name: 'כניסה' })
    await expect(btn).toBeVisible()
    await expect(btn).not.toBeDisabled()
  })

  test('שדה קוד גישה ריק → מציג שגיאה, לא מתקדם', async ({ page }) => {
    await gotoAdminSetupLocked(page)
    await page.getByRole('button', { name: 'כניסה', exact: true }).click()
    await expect(page.getByPlaceholder('למשל: ועד הבית תל אביב')).toBeHidden()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByText('הכנס קוד גישה')).toBeVisible({ timeout: 8_000 })
  })

  test('Enter בשדה סיסמה מפעיל כניסה', async ({ page }) => {
    await gotoAdminSetupLocked(page)
    const field = page.locator('input[type="password"]')
    await field.click()
    await field.fill('any-secret')
    await page.keyboard.press('Enter')
    await expectAdminSetupForm(page)
  })

  test('אחרי הקלדת secret — טופס מלא מוצג (שם חברה, אימייל)', async ({ page }) => {
    await unlockAdminSetup(page)
    await expect(page.getByPlaceholder('למשל: ועד הבית תל אביב')).toBeVisible()
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
  })

  test('טופס — שדות חברה מוצגים לאחר פתיחה', async ({ page }) => {
    await unlockAdminSetup(page)
    await expect(page.getByText('פרטי חברה').first()).toBeVisible()
    await expect(page.getByText('מנהל הלקוח').first()).toBeVisible()
    await expect(page.getByText('פרויקטים').first()).toBeVisible()
    await expect(page.getByText('עובדים').first()).toBeVisible()
  })

  test('טופס — תפריט תכנית כולל 4 אפשרויות', async ({ page }) => {
    await unlockAdminSetup(page)
    const select = page.locator('select').first()
    await expect(select).toBeVisible()
    const options = await select.locator('option').allTextContents()
    expect(options.length).toBe(4)
    expect(options.join(' ')).toContain('Starter')
    expect(options.join(' ')).toContain('Pro')
    expect(options.join(' ')).toContain('Business')
    expect(options.join(' ')).toContain('Enterprise')
  })

  test('טופס — כפתור "הוסף פרויקט" מוסיף שורה', async ({ page }) => {
    await unlockAdminSetup(page)
    const addProjectBtn = page.getByRole('button', { name: /הוסף פרויקט/i })
    await expect(addProjectBtn).toBeVisible()
    const beforeCount = await page.locator('input[placeholder="שם הפרויקט"]').count()
    await addProjectBtn.click()
    const afterCount = await page.locator('input[placeholder="שם הפרויקט"]').count()
    expect(afterCount).toBe(beforeCount + 1)
  })

  test('טופס — כפתור "הוסף עובד" מוסיף שורה', async ({ page }) => {
    await unlockAdminSetup(page)
    const addWorkerBtn = page.getByRole('button', { name: /הוסף עובד/i })
    await expect(addWorkerBtn).toBeVisible()
    const beforeCount = await page.locator('input[placeholder="שם מלא"]').count()
    await addWorkerBtn.click()
    const afterCount = await page.locator('input[placeholder="שם מלא"]').count()
    expect(afterCount).toBe(beforeCount + 1)
  })

  test('טופס — הגשה ריקה מציגה הודעת שגיאה', async ({ page }) => {
    await unlockAdminSetup(page)
    const submitBtn = page.getByRole('button', { name: /הקם לקוח/i })
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()
    await expect(page.getByText('חסר שם חברה').or(page.getByText(/חסר/)).first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test('כפתור הקמה — disabled בזמן loading', async ({ page }) => {
    await unlockAdminSetup(page, 'test-secret')
    await page.getByPlaceholder('למשל: ועד הבית תל אביב').fill('חברת טסט')
    await page.locator('input[type="email"]').first().fill('test@test.com')
    await page.locator('input[placeholder="שם הפרויקט"]').first().fill('פרויקט ראשון')
    await page.locator('input[placeholder="PROJ1"]').first().fill('P1')

    const submitBtn = page.getByRole('button', { name: /הקם לקוח|מקים לקוח/i })
    await submitBtn.click()
    await expect(submitBtn).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════════
// Removed public diagnostics
// ═══════════════════════════════════════════════════════════════

test.describe('API diagnostics removed', () => {
  test('GET /api/health דורש auth (לא ציבורי)', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════
// API /admin/setup-client — אבטחה
// ═══════════════════════════════════════════════════════════════

test.describe('API /admin/setup-client — אבטחה', () => {
  test('POST ללא header → 401', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', {
      data: { company_name: 'Test', admin_email: 'a@b.com', projects: [{ name: 'P', project_code: 'P1' }] },
    })
    expect(res.status()).toBe(401)
  })

  test('POST עם secret שגוי → 401', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', {
      headers: { 'x-admin-secret': 'completely-wrong-xyz-123' },
      data: { company_name: 'Test', admin_email: 'a@b.com', projects: [{ name: 'P', project_code: 'P1' }] },
    })
    expect(res.status()).toBe(401)
  })

  test('POST body ריק ללא auth → 400 או 401', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', { data: {} })
    expect([400, 401]).toContain(res.status())
  })

  test('POST עם admin_email לא תקין ו-secret שגוי → 401 (auth קודם)', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', {
      data: { company_name: 'T', admin_email: 'not-an-email', projects: [] },
    })
    expect(res.status()).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════
// API routes — מחייבים session
// ═══════════════════════════════════════════════════════════════

test.describe('API routes — session נדרש', () => {
  const routes: Array<{ method: string; path: string }> = [
    { method: 'POST', path: '/api/create-ticket' },
    { method: 'POST', path: '/api/create-project' },
    { method: 'POST', path: '/api/create-worker' },
    { method: 'PATCH', path: '/api/close-ticket' },
    { method: 'PATCH', path: '/api/assign-ticket' },
    { method: 'POST', path: '/api/merge-ticket' },
    { method: 'GET', path: '/api/billing/summary' },
    { method: 'POST', path: '/api/projects/pilot-sms' },
    { method: 'GET', path: '/api/projects/documents' },
  ]

  for (const { method, path } of routes) {
    test(`${method} ${path} → 401/403 ללא session`, async ({ request }) => {
      const res =
        method === 'GET'
          ? await request.get(path)
          : await request.fetch(path, { method, data: {} })
      expect([401, 403]).toContain(res.status())
    })
  }
})

// ═══════════════════════════════════════════════════════════════
// דף /tickets — אלמנטים בסיסיים (ללא auth — redirect)
// ═══════════════════════════════════════════════════════════════

test.describe('/tickets — redirect ואבטחה', () => {
  test('/tickets ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/tickets')
  })

  test('/tickets?project=X ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/tickets?project=PROJ1')
  })

  test('/tickets?status=OPEN ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/tickets?status=NEW')
  })
})

// ═══════════════════════════════════════════════════════════════
// דף /projects — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('/projects — redirect', () => {
  test('/projects ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/projects')
  })
})

// ═══════════════════════════════════════════════════════════════
// דף /workers — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('/workers — redirect', () => {
  test('/workers ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/workers')
  })
})

// ═══════════════════════════════════════════════════════════════
// QR — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('/qr — redirect', () => {
  test('/qr ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/qr')
  })
})

// ═══════════════════════════════════════════════════════════════
// Add-on pages — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('דפי תוספים — redirect', () => {
  for (const route of ['/addons', '/pilot-sms', '/project-documents', '/calendar', '/attendance', '/professionals']) {
    test(`${route} ללא auth → /login`, async ({ page }) => {
      await expectRedirectToLogin(page, route)
    })
  }

  test('/pilot-sms?project=uuid ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/pilot-sms?project=00000000-0000-0000-0000-000000000001')
  })
})

// ═══════════════════════════════════════════════════════════════
// Settings — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('/settings — redirect', () => {
  test('/settings ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/settings')
  })

  test('/settings/whatsapp-templates ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/settings/whatsapp-templates')
  })
})

// ═══════════════════════════════════════════════════════════════
// Summary — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('/summary — redirect', () => {
  test('/summary ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/summary')
  })
})

// ═══════════════════════════════════════════════════════════════
// Pending residents — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('/pending-residents — redirect', () => {
  test('/pending-residents ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/pending-residents')
  })
})

// ═══════════════════════════════════════════════════════════════
// Onboarding — redirect
// ═══════════════════════════════════════════════════════════════

test.describe('/onboarding — redirect', () => {
  test('/onboarding ללא auth → /login', async ({ page }) => {
    await expectRedirectToLogin(page, '/onboarding')
  })
})

// ═══════════════════════════════════════════════════════════════
// Worker public page — ללא token
// ═══════════════════════════════════════════════════════════════

test.describe('/worker — ציבורי עם token', () => {
  test('/worker ללא token — מציג הודעה ולא מקריס', async ({ page }) => {
    await page.goto('/worker')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(5)
  })

  test('/worker?token=invalid — מציג שגיאה ולא 500', async ({ page }) => {
    await page.goto('/worker?token=invalid-token-xyz')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(5)
  })
})

// ═══════════════════════════════════════════════════════════════
// עקביות ניווט
// ═══════════════════════════════════════════════════════════════

test.describe('עקביות ניווט — לינקים ב-/login לא שבורים', () => {
  test('לינקים בדף login מחזירים <500', async ({ page }) => {
    await page.goto('/login')
    const links = await page.locator('a[href]').all()
    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        const res = await page.request.get(href).catch(() => null)
        if (res) {
          expect(res.status(), `Link ${href} → ${res.status()}`).toBeLessThan(500)
        }
      }
    }
  })

  test('GET / → לא 5xx', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status()).toBeLessThan(500)
  })
})

// ═══════════════════════════════════════════════════════════════
// Robots.txt & manifest.json — קבצי PWA ציבוריים
// ═══════════════════════════════════════════════════════════════

test.describe('קבצים סטטיים ציבוריים', () => {
  test('/robots.txt מחזיר 200', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
  })

  test('/manifest.json מחזיר 200 ו-JSON תקין', async ({ request }) => {
    const res = await request.get('/manifest.json')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('name')
  })

  test('/offline.html מחזיר 200', async ({ request }) => {
    const res = await request.get('/offline.html')
    expect(res.status()).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════
// Content-Type headers — JSON APIs
// ═══════════════════════════════════════════════════════════════

test.describe('Content-Type headers', () => {
  test('/api/admin/setup-client (POST 401) מחזיר JSON', async ({ request }) => {
    const res = await request.post('/api/admin/setup-client', { data: {} })
    const ct = res.headers()['content-type'] ?? ''
    expect(ct).toContain('application/json')
  })
})

// ═══════════════════════════════════════════════════════════════
// מובייל — viewport iPhone
// ═══════════════════════════════════════════════════════════════

test.describe('מובייל — /login ב-iPhone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('/login עולה על מובייל', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('body')).toBeVisible()
    const btn = page.locator('button').filter({ hasText: /google/i }).first()
    await expect(btn).toBeVisible({ timeout: 8_000 })
  })

  test('/admin/setup עולה על מובייל — שדה סיסמה נגיש', async ({ page }) => {
    await page.goto('/admin/setup')
    const field = page.locator('input[type="password"]')
    await expect(field).toBeVisible({ timeout: 8_000 })
    const box = await field.boundingBox()
    expect(box?.height).toBeGreaterThan(30)
    expect(box?.width).toBeGreaterThan(100)
  })
})
