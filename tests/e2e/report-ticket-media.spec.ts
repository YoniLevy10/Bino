/**
 * E2E: public report form — ticket + photo + video attachments.
 * Uses route interception so the test runs without a live Supabase project.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'

const CLIENT_ID = '11111111-1111-1111-1111-111111111111'
const PROJECT_CODE = 'BMK001'
const FIXTURES = path.join(process.cwd(), 'tests/fixtures')

test.describe('דיווח ציבורי — תקלה + תמונה + סרטון @media', () => {
  test('טופס /report שולח תמונה וסרטון ב-multipart', async ({ page }) => {
    let createTicketContentType = ''
    let createTicketBody = ''

    await page.route('**/api/public/projects**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: 'Building Test',
              project_code: PROJECT_CODE,
              client_id: CLIENT_ID,
            },
          ],
        }),
      })
    })

    await page.route('**/api/create-ticket', async (route) => {
      const req = route.request()
      createTicketContentType = req.headers()['content-type'] || ''
      createTicketBody = req.postData() || ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          mode: 'created_from_web_form',
          ticketId: '33333333-3333-3333-3333-333333333333',
          ticketNumber: 4242,
        }),
      })
    })

    await page.goto(`/report?project=${PROJECT_CODE}&client=${CLIENT_ID}`)
    await page.waitForLoadState('domcontentloaded')

    await page.locator('textarea').fill('Water leak — E2E media test')
    await page.locator('#images').setInputFiles([
      path.join(FIXTURES, 'test-image.png'),
      path.join(FIXTURES, 'test-video.mp4'),
    ])

    await expect(page.locator('text=test-image.png')).toBeVisible()
    await expect(page.locator('text=test-video.mp4')).toBeVisible()

    await page.locator('button[type=submit]').click()

    await expect(page.getByText('תקלה #4242 נשלחה בהצלחה')).toBeVisible({ timeout: 10_000 })

    expect(createTicketContentType).toContain('multipart/form-data')
    expect(createTicketBody).toContain('test-image.png')
    expect(createTicketBody).toContain('test-video.mp4')
    expect(createTicketBody).toContain('Water leak')
  })

  test('file input accepts video MIME types', async ({ page }) => {
    await page.goto(`/report?project=${PROJECT_CODE}&client=${CLIENT_ID}`)
    const accept = await page.locator('#images').getAttribute('accept')
    expect(accept).toContain('video/mp4')
    expect(accept).toContain('video/webm')
    expect(accept).toContain('image/jpeg')
  })

  test('POST /api/create-ticket multipart integration (real handler, mocked DB)', async ({
    request,
  }) => {
    test.skip(
      !process.env.E2E_LIVE_SUPABASE,
      'Set E2E_LIVE_SUPABASE=1 with real Supabase env to run live API test'
    )

    const png = path.join(FIXTURES, 'test-image.png')
    const mp4 = path.join(FIXTURES, 'test-video.mp4')

    const res = await request.post('/api/create-ticket', {
      multipart: {
        client_id: process.env.BAMAKOR_CLIENT_ID || CLIENT_ID,
        project_code: process.env.E2E_PROJECT_CODE || PROJECT_CODE,
        description: 'Playwright live media test',
        source: 'web_form',
        attachments: [
          { name: 'attachments', mimeType: 'image/png', buffer: await readFixture(png) },
          { name: 'attachments', mimeType: 'video/mp4', buffer: await readFixture(mp4) },
        ],
      },
    })

    expect(res.ok()).toBeTruthy()
    const json = await res.json()
    expect(json.ticketNumber).toBeTruthy()
  })
})

async function readFixture(filePath: string): Promise<Buffer> {
  const fs = await import('node:fs/promises')
  return fs.readFile(filePath)
}
