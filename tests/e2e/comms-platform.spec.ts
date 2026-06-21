import { test, expect } from '@playwright/test'

test.describe('תקשורת — smoke (auth redirect)', () => {
  const routes = ['/whatsapp-inbox', '/campaigns', '/assistant', '/notifications/failed']

  for (const route of routes) {
    test(`${route} מפנה ל-login ללא session`, async ({ page }) => {
      await page.goto(route)
      await page.waitForURL(/\/login/, { timeout: 10_000 })
      await expect(page).toHaveURL(/\/login/)
    })
  }
})

test.describe('API smoke — תקשורת', () => {
  test('POST /api/whatsapp/send דורש auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/send', {
      data: { phone: '972501234567', body: 'test' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('POST /api/whatsapp/send-template דורש auth', async ({ request }) => {
    const res = await request.post('/api/whatsapp/send-template', {
      data: { phone: '972501234567', template_id: 'ticket_closed', params: ['בניין בדיקה'] },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('POST /api/sms/campaigns דורש auth', async ({ request }) => {
    const res = await request.post('/api/sms/campaigns', {
      data: { project_id: '00000000-0000-0000-0000-000000000001', message_body: 'test' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('POST /api/assistant/query דורש auth', async ({ request }) => {
    const res = await request.post('/api/assistant/query', { data: { question: 'כמה תקלות?' } })
    expect([401, 403]).toContain(res.status())
  })
})
