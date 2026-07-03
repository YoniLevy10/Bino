import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useTicketDetailData hook', () => {
  it('exports recover and attachment loading helpers', () => {
    const source = readFileSync(join(__dirname, '../lib/hooks/use-ticket-detail-data.ts'), 'utf8')
    expect(source).toContain('recoverAndReloadAttachments')
    expect(source).toContain('loadTicketDrawerData')
    expect(source).toContain('recoverWhatsAppMediaForTicket')
  })
})
