import { test, expect } from '@playwright/test'
import { ticketDetailPath } from '../../lib/ticket-deep-link'

test.describe('Ticket detail parity — routing', () => {
  test('deep link /tickets?ticket= loads login redirect without crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => {
      const msg = e.message
      if (msg.includes('hydrat')) return
      errors.push(msg)
    })

    await page.goto(ticketDetailPath('00000000-0000-4000-8000-000000000001'))
    await page.waitForURL(/\/login/, { timeout: 12_000 })
    await expect(page).toHaveURL(/\/login/)
    expect(errors).toHaveLength(0)
  })

  test('summary page loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => {
      if (e.message.includes('hydrat')) return
      errors.push(e.message)
    })

    await page.goto('/summary')
    await page.waitForURL(/\/login/, { timeout: 12_000 })
    expect(errors).toHaveLength(0)
  })

  test('projects page loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => {
      if (e.message.includes('hydrat')) return
      errors.push(e.message)
    })

    await page.goto('/projects')
    await page.waitForURL(/\/login/, { timeout: 12_000 })
    expect(errors).toHaveLength(0)
  })

  test('workers page loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => {
      if (e.message.includes('hydrat')) return
      errors.push(e.message)
    })

    await page.goto('/workers')
    await page.waitForURL(/\/login/, { timeout: 12_000 })
    expect(errors).toHaveLength(0)
  })

  test('ticketDetailPath is stable for global search hrefs', () => {
    const id = 'test-ticket-id'
    expect(ticketDetailPath(id)).toMatch(/^\/tickets\?ticket=/)
  })
})
