import { describe, expect, it } from 'vitest'
import {
  STASHED_FOLLOWUP_CODE,
  STASHED_DESCRIPTION_CODE,
  stashedOpenTicketFollowup,
  stashedProblemDescription,
  isStashRow,
} from './building-search-stash'

describe('open ticket followup stash helpers', () => {
  it('reads ticket id/number from followup stash row', () => {
    const projects = [
      {
        id: STASHED_DESCRIPTION_CODE,
        name: 'נזילה במקלחת',
        project_code: STASHED_DESCRIPTION_CODE,
        address: 'נזילה במקלחת',
      },
      {
        id: STASHED_FOLLOWUP_CODE,
        name: 'ticket-uuid',
        project_code: STASHED_FOLLOWUP_CODE,
        address: '42',
      },
    ]
    expect(stashedProblemDescription(projects)).toBe('נזילה במקלחת')
    expect(stashedOpenTicketFollowup(projects)).toEqual({
      ticketId: 'ticket-uuid',
      ticketNumber: 42,
    })
    expect(projects.every(isStashRow)).toBe(true)
  })

  it('returns null for invalid followup stash', () => {
    expect(
      stashedOpenTicketFollowup([
        {
          id: STASHED_FOLLOWUP_CODE,
          name: '',
          project_code: STASHED_FOLLOWUP_CODE,
          address: '0',
        },
      ])
    ).toBeNull()
  })
})
