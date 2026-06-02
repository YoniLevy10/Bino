import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression: fields read from waClient in webhook must appear in tenant-resolution SELECT.
 */
describe('tenant-resolution WhatsApp client fields', () => {
  const repoRoot = join(__dirname, '..')

  it('SELECT includes every waClient field used in webhook route', () => {
    const resolutionSrc = readFileSync(join(repoRoot, 'lib/tenant-resolution.ts'), 'utf8')
    const webhookSrc = readFileSync(join(repoRoot, 'app/api/webhook/whatsapp/route.ts'), 'utf8')

    const selectMatch = resolutionSrc.match(
      /\.select\('([^']+)'\)\s*\n\s*\.eq\('whatsapp_phone_number_id'/
    )
    expect(selectMatch).toBeTruthy()
    const selectFields = new Set(
      selectMatch![1].split(',').map((f) => f.trim()).filter(Boolean)
    )

    const waClientAccesses = [
      ...webhookSrc.matchAll(/waClient\.([a-zA-Z_][a-zA-Z0-9_]*)/g),
    ].map((m) => m[1])

    const unique = [...new Set(waClientAccesses)]
    const missing = unique.filter((f) => !selectFields.has(f))
    expect(missing).toEqual([])
  })
})
