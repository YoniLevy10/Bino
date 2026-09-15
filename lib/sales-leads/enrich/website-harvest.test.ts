import { describe, expect, it } from 'vitest'
import { extractContactsFromHtml } from '@/lib/sales-leads/enrich/website-harvest'

describe('extractContactsFromHtml', () => {
  it('extracts email, wa.me, and Israeli phones', () => {
    const html = `
      <a href="mailto:info@mgmt-buildings.co.il">mail</a>
      <a href="https://wa.me/972501234567">wa</a>
      <p>טלפון: 03-1234567 וגם 050-9876543</p>
    `
    const r = extractContactsFromHtml(html)
    expect(r.emails).toContain('info@mgmt-buildings.co.il')
    expect(r.whatsappPhones.some((p) => p.includes('97250'))).toBe(true)
    expect(r.phones.length).toBeGreaterThan(0)
  })
})
