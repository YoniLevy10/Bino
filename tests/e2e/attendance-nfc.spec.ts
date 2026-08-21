import { test, expect } from '@playwright/test'

test.describe('worker stamp (NFC attendance)', () => {
  test('deprecated office scan page redirects message', async ({ page }) => {
    await page.goto('/attendance/scan')
    await expect(page.getByRole('heading', { name: /עברנו למדבקות NFC/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /לחתמת עובדים/i })).toBeVisible()
  })

  test('worker NFC page shows error without tag', async ({ page }) => {
    await page.goto('/worker/nfc')
    await expect(page.getByText(/חסר קוד מדבקה|הצמידו את הטלפון/i)).toBeVisible({ timeout: 15000 })
  })

  test('worker NFC page asks for one-time SMS bind without token', async ({ page }) => {
    await page.goto('/worker/nfc?t=TESTTAG')
    await expect(page.getByText(/פעם אחת בלבד/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /קישור מה-SMS/i })).toBeVisible()
  })
})
