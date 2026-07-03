import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TICKET_DETAIL_ENTRY_POINTS,
  TICKET_DETAIL_NAV_SOURCES,
  TICKET_DETAIL_PARITY_FEATURES,
} from '@/lib/ticket-detail-parity'
import { ticketDetailPath, parseTicketIdFromSearchParams } from '@/lib/ticket-deep-link'

const ROOT = join(__dirname, '..')

function readRepoFile(relPath: string): string {
  const full = join(ROOT, relPath)
  expect(existsSync(full), `missing file: ${relPath}`).toBe(true)
  return readFileSync(full, 'utf8')
}

describe('ticket detail parity contract', () => {
  it('defines a non-empty feature list', () => {
    expect(TICKET_DETAIL_PARITY_FEATURES.length).toBeGreaterThanOrEqual(6)
    expect(TICKET_DETAIL_PARITY_FEATURES).toContain('whatsapp_recover_button')
    expect(TICKET_DETAIL_PARITY_FEATURES).toContain('ticket_logs')
  })

  it('uses shared ticket detail data hook on dashboard and /tickets', () => {
    for (const entry of TICKET_DETAIL_ENTRY_POINTS) {
      const source = readRepoFile(entry.pageFile)
      expect(source).toContain('useTicketDetailData')
      expect(source).toContain(entry.drawerComponent)
      expect(source).toContain('onRecoverMedia')
      expect(source).toContain('ticketLogs')
    }
  })

  it('navigation sources deep-link via ticketDetailPath', () => {
    for (const nav of TICKET_DETAIL_NAV_SOURCES) {
      const source = readRepoFile(nav.file)
      expect(source).toContain(nav.mustUse)
    }
  })

  it('TicketDetailDrawer exposes recover, logs, and WhatsApp thread props', () => {
    const drawer = readRepoFile('app/components/tickets/TicketDetailDrawer.tsx')
    expect(drawer).toContain('שחזר תמונה/וידאו מ-WhatsApp')
    expect(drawer).toContain('היסטוריה')
    expect(drawer).toContain('TicketWhatsAppThread')
    expect(drawer).toContain('onRecoverMedia')
  })
})

describe('ticket deep link helpers', () => {
  it('builds /tickets?ticket= URL', () => {
    expect(ticketDetailPath('abc-123')).toBe('/tickets?ticket=abc-123')
  })

  it('parses ticket id from search params', () => {
    const params = new URLSearchParams('ticket=abc-123&status=NEW')
    expect(parseTicketIdFromSearchParams(params)).toBe('abc-123')
    expect(parseTicketIdFromSearchParams(new URLSearchParams())).toBeNull()
  })
})
