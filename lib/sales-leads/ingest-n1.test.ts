import { describe, expect, it, vi } from 'vitest'
import { ingestFromAdapter } from '@/lib/sales-leads/service'
import type { SalesLeadSourceAdapter } from '@/lib/sales-leads/adapters/types'

function makeAdmin(existingRows: Record<string, unknown>[]) {
  const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = []
  let selectCalls = 0

  const from = vi.fn((table: string) => {
    if (table === 'sales_leads') {
      return {
        select: (_cols: string) => {
          selectCalls += 1
          return {
            limit: async () => ({ data: existingRows, error: null }),
            eq: (col: string, id: string) => ({
              maybeSingle: async () => {
                // Should not be used for duplicate path after the fix.
                selectCalls += 1
                return { data: existingRows.find((r) => r.id === id) ?? null, error: null }
              },
            }),
          }
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            updateCalls.push({ id, patch })
            return { error: null }
          },
        }),
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'unexpected insert' } }),
          }),
        }),
      }
    }
    if (table === 'sales_lead_events') {
      return { insert: async () => ({ error: null }) }
    }
    return {}
  })

  return {
    admin: { from } as unknown as Parameters<typeof ingestFromAdapter>[0],
    updateCalls,
    getSelectCalls: () => selectCalls,
  }
}

describe('ingestFromAdapter N+1 avoidance', () => {
  it('updates duplicates without per-row SELECT and batches updates', async () => {
    const existing = [
      {
        id: 'lead-1',
        phone_normalized: '972501111111',
        source_name: 'google_places',
        external_id: 'ext-1',
        business_name: 'Acme Mgmt',
        segment_slug: 'building_mgmt',
        city: 'תל אביב',
        website_url: 'https://acme.example',
        source_url: null,
        status: 'new',
        source_refs: [],
        phone: '0501111111',
        fit_score: 40,
      },
      {
        id: 'lead-2',
        phone_normalized: '972502222222',
        source_name: 'google_places',
        external_id: 'ext-2',
        business_name: 'Beta Mgmt',
        segment_slug: 'building_mgmt',
        city: 'חיפה',
        website_url: null,
        source_url: null,
        status: 'new',
        source_refs: [],
        phone: null,
        fit_score: null,
      },
    ]

    const { admin, updateCalls, getSelectCalls } = makeAdmin(existing)

    const adapter: SalesLeadSourceAdapter = {
      name: 'google_places',
      async fetchRecords() {
        return [
          {
            name: 'Acme Mgmt',
            businessName: 'Acme Mgmt',
            phone: '0501111111',
            city: 'תל אביב',
            sourceName: 'google_places',
            externalId: 'ext-1',
            websiteUrl: 'https://acme.example',
            segmentSlug: 'building_mgmt',
            estimatedMrrIls: 500,
          },
          {
            name: 'Beta Mgmt',
            businessName: 'Beta Mgmt',
            phone: '0502222222',
            city: 'חיפה',
            sourceName: 'google_places',
            externalId: 'ext-2',
            segmentSlug: 'building_mgmt',
            estimatedMrrIls: 600,
          },
        ]
      },
    }

    const result = await ingestFromAdapter(admin, adapter)
    expect(result.updated).toBe(2)
    expect(result.created).toBe(0)
    expect(updateCalls).toHaveLength(2)
    // One loadExistingLite select only — no per-duplicate maybeSingle.
    expect(getSelectCalls()).toBe(1)
  })
})
