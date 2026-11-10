import { defineConfig, devices } from '@playwright/test'

/** Speed runs build their own production server so a `next dev` on :3000 is not measured. */
const speedRun = process.env.E2E_SPEED === '1'
const port = speedRun ? 3010 : 3000
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    // Use production server for stable E2E (avoids dev "Compiling..." overlay/timeouts)
    command: speedRun
      ? `npx next build --webpack && PORT=${port} npm run start`
      : 'npm run build && npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI && !speedRun,
    timeout: speedRun ? 600_000 : 180_000,
  },
})
