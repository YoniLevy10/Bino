import { createHmac } from 'crypto'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  getFixlyStatusPresentation,
  inferCityFromAddress,
  mapBamakorPriorityToFixly,
  mapFixlyStatusToTicketStatus,
  mapToFixlyCategory,
  truncateTitle,
} from '@/lib/fixly'
import { verifyFixlyWebhookSignature } from '@/lib/fixly-webhook'

describe('fixly helpers', () => {
  it('maps Hebrew and English categories', () => {
    expect(mapToFixlyCategory('מעליות')).toBe('elevators')
    expect(mapToFixlyCategory('plumbing')).toBe('plumbing')
    expect(mapToFixlyCategory('unknown-xyz')).toBe('general')
  })

  it('maps Bamakor priorities to Fixly', () => {
    expect(mapBamakorPriorityToFixly('URGENT')).toBe('urgent')
    expect(mapBamakorPriorityToFixly('LOW')).toBe('low')
    expect(mapBamakorPriorityToFixly(null)).toBe('medium')
  })

  it('maps Fixly statuses to ticket statuses', () => {
    expect(mapFixlyStatusToTicketStatus('en_route')).toBe('PROFESSIONAL_ESCORT')
    expect(mapFixlyStatusToTicketStatus('completed')).toBe('CLOSED')
    expect(mapFixlyStatusToTicketStatus('no_providers')).toBe('NEW')
    expect(mapFixlyStatusToTicketStatus('offered')).toBeNull()
  })

  it('presents Hebrew labels', () => {
    expect(getFixlyStatusPresentation('en_route').labelHe).toContain('בדרך')
    expect(getFixlyStatusPresentation('weird').tone).toBe('neutral')
  })

  it('infers city from address and truncates titles', () => {
    expect(inferCityFromAddress('חלץ 12, חדרה')).toBe('חדרה')
    expect(truncateTitle('א'.repeat(100)).endsWith('…')).toBe(true)
  })
})

describe('verifyFixlyWebhookSignature', () => {
  const prev = process.env.BAMAKOR_WEBHOOK_SECRET

  beforeEach(() => {
    process.env.BAMAKOR_WEBHOOK_SECRET = 'test-secret-fixly'
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.BAMAKOR_WEBHOOK_SECRET
    else process.env.BAMAKOR_WEBHOOK_SECRET = prev
  })

  it('accepts valid sha256 signatures', () => {
    const body = JSON.stringify({ job_id: '1', status: 'accepted' })
    const sig = createHmac('sha256', 'test-secret-fixly').update(body, 'utf8').digest('hex')
    expect(verifyFixlyWebhookSignature(body, `sha256=${sig}`)).toBe(true)
    expect(verifyFixlyWebhookSignature(body, sig)).toBe(true)
  })

  it('rejects invalid signatures', () => {
    const body = '{"a":1}'
    expect(verifyFixlyWebhookSignature(body, 'sha256=deadbeef')).toBe(false)
    expect(verifyFixlyWebhookSignature(body, null)).toBe(false)
  })
})
