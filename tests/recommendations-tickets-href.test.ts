import { describe, expect, it } from 'vitest'
import { ticketsHrefForProject } from '@/lib/recommendations/tickets-href'

describe('ticketsHrefForProject', () => {
  it('prefers project_code for /tickets filter deep-link', () => {
    expect(ticketsHrefForProject('uuid-1', 'BMK17')).toBe('/tickets?project=BMK17')
  })

  it('encodes special characters in project_code', () => {
    expect(ticketsHrefForProject('uuid-1', 'A B')).toBe('/tickets?project=A%20B')
  })

  it('falls back to project_id when code is missing', () => {
    expect(ticketsHrefForProject('66ed1df1-1ed7-474c-ab47-6e57521cd375', null)).toBe(
      '/tickets?project_id=66ed1df1-1ed7-474c-ab47-6e57521cd375'
    )
    expect(ticketsHrefForProject('uuid-1', '   ')).toBe('/tickets?project_id=uuid-1')
  })
})
