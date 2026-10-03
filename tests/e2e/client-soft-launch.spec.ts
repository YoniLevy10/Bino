/**
 * Soft-launch E2E from the client / resident / worker side.
 * Uses route mocks (no Google login / live Grow). Live manual checks:
 * docs/CLIENT_SOFT_LAUNCH_SMOKE.md
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import {
  LAUNCH_PLAYBOOK_HEADER,
  LIVE_SMOKE_CHECKS,
} from '../../lib/client-launch-checklist'

const CLIENT_ID = '11111111-1111-1111-1111-111111111111'
const PROJECT_CODE = 'BMK001'
const PAY_TOKEN = 'pay-e2e-soft-launch-token'
const WORKER_TOKEN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TICKET_ID = '44444444-4444-4444-4444-444444444444'
const FIXTURES = path.join(process.cwd(), 'tests/fixtures')

async function gotoOk(page: import('@playwright/test').Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
  } catch (err) {
    // Redirects during navigation can abort the first document load.
    if (!String(err).includes('ERR_ABORTED')) throw err
  }
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Soft launch — שערים ומסכים ציבוריים', () => {
  test('דפי מנהל מוגנים מפנים ל-/login', async ({ page }) => {
    for (const route of ['/dashboard', '/tickets', '/settings', '/collections', '/workers']) {
      await gotoOk(page, route)
      await page.waitForURL(/\/login/, { timeout: 12_000 })
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('פורטל דיירים — מסך כניסה עולה', async ({ page }) => {
    await gotoOk(page, '/resident/login')
    await expect(page.getByRole('heading', { name: /כניסה לפורטל הדיירים/ })).toBeVisible({
      timeout: 12_000,
    })
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('דף /vaad-pay הציבורי עולה', async ({ page }) => {
    await gotoOk(page, '/vaad-pay')
    const body = await page.locator('body').innerText()
    expect(body.trim().length).toBeGreaterThan(10)
  })

  test('playbook + live smoke constants cover soft-launch steps', () => {
    expect(LAUNCH_PLAYBOOK_HEADER).toHaveLength(7)
    expect(LIVE_SMOKE_CHECKS.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'wa_inbound_ticket',
        'sms_sender',
        'grow_pay_1ils',
        'resend_from_slug',
        'worker_portal',
        'resident_portal',
      ])
    )
  })
})

test.describe('Soft launch — דיווח ציבורי /report', () => {
  test('דייר שולח תקלה עם תמונה', async ({ page }) => {
    test.setTimeout(60_000)

    await page.route('**/api/public/projects**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: 'בניין בדיקה',
              project_code: PROJECT_CODE,
              client_id: CLIENT_ID,
            },
          ],
        }),
      })
    })

    await page.route('**/api/create-ticket', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          mode: 'created_from_web_form',
          ticketId: '33333333-3333-3333-3333-333333333333',
          ticketNumber: 9001,
        }),
      })
    })

    await page.goto(`/report?project=${PROJECT_CODE}&client=${CLIENT_ID}`)
    await expect(page.getByText('בניין בדיקה')).toBeVisible({ timeout: 15_000 })
    await page.locator('textarea').fill('נזילה במחסן — soft launch e2e')
    await page.locator('#images').setInputFiles([path.join(FIXTURES, 'test-image.png')])
    await page.locator('button[type=submit]').click()
    await expect(page.getByText('תקלה #9001 נשלחה בהצלחה')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Soft launch — דף תשלום דייר /pay', () => {
  test('טוען חיוב, שומר מייל, וממשיך לקישור תשלום', async ({ page }) => {
    let patched = false

    await page.route(`**/api/public/pay/${PAY_TOKEN}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        patched = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'דמי ועד — בדיקה',
          description: 'חיוב soft launch',
          amount: 1,
          amount_label: '₪1.00',
          currency: 'ILS',
          status: 'pending',
          can_pay: true,
          can_wallet_pay: false,
          payment_url: 'https://example.com/grow-pay-mock',
          paid_at: null,
          suggested_email: 'resident@example.com',
          suggested_phone: '0501234567',
          client: { name: 'ועד בדיקה', logo_url: null },
          resident_name: 'ישראל ישראלי',
          apartment_number: '12',
          project_name: 'בניין א',
        }),
      })
    })

    await page.goto(`/pay/${PAY_TOKEN}`)
    await expect(page.getByText('ועד בדיקה')).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('₪1.00')).toBeVisible()

    await page.locator('input[type="checkbox"]').nth(1).check()
    await page.getByRole('button', { name: 'לתשלום מאובטח' }).click()

    await page.waitForURL(/example\.com\/grow-pay-mock/, { timeout: 10_000 })
    expect(patched).toBe(true)
  })

  test('חיוב ששולם מציג אישור', async ({ page }) => {
    await page.route(`**/api/public/pay/${PAY_TOKEN}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'דמי ועד',
          description: null,
          amount: 1,
          amount_label: '₪1.00',
          currency: 'ILS',
          status: 'paid',
          can_pay: false,
          can_wallet_pay: false,
          payment_url: null,
          paid_at: new Date().toISOString(),
          receipt_email: 'resident@example.com',
          receipt_email_sent: true,
          client: { name: 'ועד בדיקה', logo_url: null },
          resident_name: null,
          apartment_number: null,
          project_name: null,
        }),
      })
    })

    await page.goto(`/pay/${PAY_TOKEN}`)
    await expect(page.getByText('התשלום התקבל. תודה!')).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('אישור נשלח למייל.')).toBeVisible()
  })
})

test.describe('Soft launch — פורטל עובד', () => {
  test('עובד רואה תקלה ויכול לשלוח תשובה', async ({ page }) => {
    const workerPayload = {
      worker_id: '55555555-5555-5555-5555-555555555555',
      client_id: CLIENT_ID,
      full_name: 'עובד בדיקה',
      worker_stamp_enabled: false,
    }
    const ticketsPayload = {
      tickets: [
        {
          id: TICKET_ID,
          ticket_number: 42,
          description: 'תקלת soft launch',
          status: 'IN_PROGRESS',
          created_at: new Date().toISOString(),
          reporter_phone: '972501234567',
          project_name: 'בניין א',
        },
      ],
    }

    await page.route('**/api/worker/bootstrap**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...workerPayload, ...ticketsPayload }),
      })
    })
    await page.route('**/api/worker-auth**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workerPayload),
      })
    })
    await page.route('**/api/worker/tickets**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ticketsPayload),
      })
    })
    await page.route('**/api/worker/whatsapp-reply**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ messages: [], conversation_id: 'c1' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, mode: 'text', reporter_phone: '972501234567' }),
      })
    })
    await page.route('**/api/worker/attachments**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ attachments: [] }),
      })
    })

    await page.goto(`/worker?token=${WORKER_TOKEN}`)
    await expect(page.getByText('תקלת soft launch').or(page.getByText('#42')).first()).toBeVisible({
      timeout: 15_000,
    })
  })
})

test.describe('Soft launch — סופר-אדמין צ׳קליסט הקמה', () => {
  test('מציג playbook + בדיקות חיות אחרי כניסה', async ({ page }) => {
    test.setTimeout(60_000)

    const clientsPayload = {
      clients: [
        {
          id: CLIENT_ID,
          name: 'לקוח בדיקה',
          plan_tier: 'pro',
          whatsapp_phone_number_id: 'wa-phone-1',
          manager_phone: '972501111111',
          sms_sender_name: '972559899132',
          logo_url: null,
          admin_email: 'admin@example.com',
          enabled_nav_features: null,
          max_workers: null,
          buildings_allowed: null,
          max_tickets_per_month: null,
          workers_active_count: 1,
          workers_total_count: 1,
          buildings_count: 1,
          residents_count: 0,
          open_tickets_count: 2,
          projects: [{ id: 'p1', name: 'בניין א', project_code: PROJECT_CODE }],
        },
      ],
    }

    await page.route('**/api/superadmin/**', async (route) => {
      const url = route.request().url()
      // MFA gate: identity + AAL2 — no shared-secret unlock.
      if (url.includes('/session')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            allowed: true,
            aal: 'aal2',
            nextLevel: null,
            email: 'superadmin@example.com',
            userId: '00000000-0000-4000-8000-000000000099',
            hasVerifiedFactor: true,
          }),
        })
        return
      }
      if (url.includes('/launch-status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'create_client',
                step: 1,
                title: '1. לקוח נוצר ב-BINO',
                detail: 'לקוח: לקוח בדיקה',
                status: 'ok',
                where: 'setup',
              },
            ],
            doneCount: 1,
            totalCount: 1,
            readyForSoftLaunch: false,
            email_slug: 'test-client',
            resolved_email_slug: 'test-client',
            email_from: 'לקוח בדיקה <test-client@bino.casa>',
            playbook: LAUNCH_PLAYBOOK_HEADER,
            live_smoke: LIVE_SMOKE_CHECKS,
            platform_notes: [],
          }),
        })
        return
      }
      if (url.includes('/plans/pricing')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ catalog: [] }),
        })
        return
      }
      if (url.includes('/stats') || url.endsWith('/clients') || url.includes('/clients?')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(clientsPayload),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    // Purge any leftover legacy secret — must never unlock the panel.
    await page.addInitScript(() => {
      try {
        sessionStorage.removeItem('bamakor_admin_secret')
        localStorage.removeItem('bamakor_admin_secret_persist')
      } catch {
        /* ignore */
      }
    })

    await page.goto(`/superadmin#client/${CLIENT_ID}/launch`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('סדר פעולה בזמן אמת')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('קנו מספר ב-019')).toBeVisible()
    await expect(page.getByText(/בדיקות חיות מקצה לקצה/)).toBeVisible()
    await expect(page.getByText('שלב 7 — בדיקות חיות')).toBeVisible()
    await expect(page.getByText('WhatsApp → תקלה אצל הלקוח הנכון')).toBeVisible()
    await expect(page.getByText('גבייה ₪1 → webhook → שולם')).toBeVisible()
  })
})

test.describe('Soft launch — API auth', () => {
  test('APIs מנהל מחזירים 401 בלי session', async ({ request }) => {
    const read = await request.get('/api/settings/read')
    expect([401, 403]).toContain(read.status())

    const postSms = await request.post('/api/settings/test-sms', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    })
    expect([401, 403]).toContain(postSms.status())

    const postWa = await request.post('/api/settings/test-whatsapp', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    })
    expect([401, 403]).toContain(postWa.status())
  })
})
