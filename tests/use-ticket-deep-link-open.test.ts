import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTicketIdFromSearchParams, TICKET_DEEP_LINK_PARAM } from '@/lib/ticket-deep-link'

const ROOT = join(__dirname, '..')

describe('useTicketDeepLinkOpen close race', () => {
  it('reads window.location.search as deep-link source of truth (not Next searchParams first)', () => {
    const source = readFileSync(join(ROOT, 'lib/hooks/use-ticket-deep-link-open.ts'), 'utf8')
    expect(source).toContain('window.location.search')
    // Must not prefer Next searchParams before location — that re-opens after replaceState clear.
    expect(source).not.toMatch(
      /parseTicketIdFromSearchParams\(searchParams\)\s*\|\|\s*parseTicketIdFromSearchParams\(new URLSearchParams\(window\.location\.search\)\)/
    )
  })

  it('parseTicketIdFromSearchParams returns null after ticket param deleted', () => {
    const params = new URLSearchParams(`${TICKET_DEEP_LINK_PARAM}=abc-123&status=NEW`)
    expect(parseTicketIdFromSearchParams(params)).toBe('abc-123')
    params.delete(TICKET_DEEP_LINK_PARAM)
    expect(parseTicketIdFromSearchParams(params)).toBeNull()
    expect(params.get('status')).toBe('NEW')
  })
})
