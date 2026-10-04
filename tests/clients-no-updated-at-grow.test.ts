import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression: clients has created_at only — writing updated_at breaks GetLink
 * with PostgREST "Could not find the 'updated_at' column of 'clients'".
 */
describe('clients grow updates omit updated_at', () => {
  it('grow-onboard route does not patch clients.updated_at', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/collections/grow-onboard/route.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/updated_at:\s*(now|new Date)/)
  })

  it('grow-register webhook does not patch clients.updated_at', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/webhook/grow-register/route.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/updated_at:\s*now/)
  })
})
