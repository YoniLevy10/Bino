import { describe, expect, it } from 'vitest'
import {
  isWhatsAppPlaceholderResident,
  WHATSAPP_PLACEHOLDER_RESIDENT_NAME,
  findApprovedResidentByPhoneClient,
} from '@/lib/residents-whatsapp'
import { phonesLikelySameResident, reporterListedInProjectResidents } from '@/lib/pending-resident-from-ticket'

describe('isWhatsAppPlaceholderResident', () => {
  it('treats auto-stub name as placeholder', () => {
    expect(isWhatsAppPlaceholderResident({ full_name: WHATSAPP_PLACEHOLDER_RESIDENT_NAME })).toBe(true)
  })

  it('treats real names as approved', () => {
    expect(isWhatsAppPlaceholderResident({ full_name: 'יוני לוי' })).toBe(false)
  })
})

describe('phonesLikelySameResident', () => {
  it('matches 05x and 972 formats', () => {
    expect(phonesLikelySameResident('972501234567', '0501234567')).toBe(true)
  })
})

describe('reporterListedInProjectResidents', () => {
  it('ignores WhatsApp placeholder stubs', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: async () => ({
                data: [
                  { phone: '972501234567', full_name: WHATSAPP_PLACEHOLDER_RESIDENT_NAME },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }

    const listed = await reporterListedInProjectResidents(
      supabase as never,
      'client-1',
      'project-1',
      '972501234567'
    )
    expect(listed).toBe(false)
  })

  it('returns true for listed resident with real name', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: async () => ({
                data: [{ phone: '972501234567', full_name: 'יוני לוי' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }

    const listed = await reporterListedInProjectResidents(
      supabase as never,
      'client-1',
      'project-1',
      '972501234567'
    )
    expect(listed).toBe(true)
  })
})

describe('findApprovedResidentByPhoneClient', () => {
  it('returns null for placeholder resident row', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'r1',
                    project_id: 'p1',
                    phone: '972501234567',
                    client_id: 'c1',
                    full_name: WHATSAPP_PLACEHOLDER_RESIDENT_NAME,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }

    const row = await findApprovedResidentByPhoneClient(supabase as never, 'c1', '972501234567')
    expect(row).toBeNull()
  })
})
