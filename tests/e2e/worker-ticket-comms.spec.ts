/**
 * E2E: worker portal — reply to resident + upload completion photo.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'

const WORKER_TOKEN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TICKET_ID = '44444444-4444-4444-4444-444444444444'
const FIXTURES = path.join(process.cwd(), 'tests/fixtures')

test.describe('פורטל עובד — שיחה + תמונה @media', () => {
  test('עובד שולח תשובה לדייר ומעלה תמונה', async ({ page }) => {
    let replyBody = ''
    let uploadContentType = ''

    const workerPayload = {
      worker_id: '55555555-5555-5555-5555-555555555555',
      client_id: '11111111-1111-1111-1111-111111111111',
      full_name: 'עובד בדיקה',
      worker_stamp_enabled: false,
    }
    const ticketsPayload = {
      tickets: [
        {
          id: TICKET_ID,
          ticket_number: 77,
          description: 'דליפה בחדר מדרגות',
          status: 'IN_PROGRESS',
          created_at: new Date().toISOString(),
          reporter_phone: '972501234567',
          project_name: 'בניין א',
        },
      ],
    }

    // Portal open uses /api/worker/bootstrap (profile + tickets in one round-trip).
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
          body: JSON.stringify({ messages: [], conversation_id: 'conv-1' }),
        })
        return
      }

      replyBody = route.request().postData() || ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, mode: 'text', reporter_phone: '972501234567' }),
      })
    })

    await page.route('**/api/worker/attachments**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ attachments: [] }),
        })
        return
      }

      uploadContentType = route.request().headers()['content-type'] || ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          attachment: {
            id: 'att-1',
            file_name: 'test-image.png',
            file_url: `${TICKET_ID}/photo.png`,
            mime_type: 'image/png',
            attachment_type: 'worker_completion',
            created_at: new Date().toISOString(),
            public_url: 'https://example.com/signed/photo.png',
          },
        }),
      })
    })

    await page.goto(`/worker?token=${WORKER_TOKEN}`)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('דליפה בחדר מדרגות')).toBeVisible({ timeout: 15_000 })
    await page.getByText('דליפה בחדר מדרגות').click()

    await page.getByRole('button', { name: /WhatsApp לדייר/i }).click()

    const replyInput = page.locator('textarea').first()
    await expect(replyInput).toBeVisible({ timeout: 10_000 })
    await replyInput.fill('הטכנאי בדרך אליך')
    await page.getByRole('button', { name: 'שלח לדייר' }).click()

    await expect.poll(() => replyBody.includes('הטכנאי בדרך')).toBeTruthy()
    expect(replyBody).toContain(TICKET_ID)

    await page.getByRole('button', { name: /צלם לדייר/i }).click()
    const photoInput = page.locator('input[type=file][accept*="image"]')
    await photoInput.setInputFiles(path.join(FIXTURES, 'test-image.png'))

    await expect(
      page.getByText('תמונה נשמרה').or(page.getByText('test-image.png'))
    ).toBeVisible({ timeout: 10_000 })
    expect(uploadContentType).toContain('multipart/form-data')
  })
})
