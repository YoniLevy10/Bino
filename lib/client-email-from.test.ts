import { afterEach, describe, expect, it } from 'vitest'
import { buildClientResendFrom } from '@/lib/client-email-from'

describe('buildClientResendFrom', () => {
  const prev = process.env.RESEND_FROM_EMAIL

  afterEach(() => {
    if (prev === undefined) delete process.env.RESEND_FROM_EMAIL
    else process.env.RESEND_FROM_EMAIL = prev
  })

  it('always uses platform noreply@bino.casa (ignores client slug)', () => {
    delete process.env.RESEND_FROM_EMAIL
    expect(buildClientResendFrom({ clientName: 'Bamakor', emailSlug: 'bamakor' })).toBe(
      'Bino <noreply@bino.casa>'
    )
  })

  it('respects RESEND_FROM_EMAIL override', () => {
    process.env.RESEND_FROM_EMAIL = 'Bino <ops@bino.casa>'
    expect(buildClientResendFrom({ clientName: 'סביון' })).toBe('Bino <ops@bino.casa>')
  })
})
