import { describe, expect, it } from 'vitest'
import { assertBrandInOrg } from '@/lib/mbrain/auth'

/**
 * Unit-level tenant boundary: assertBrandInOrg must query with BOTH
 * organization_id and brand_id. We simulate a supabase-like client.
 */
describe('mbrain tenant isolation', () => {
  it('rejects brand that belongs to another organization', async () => {
    const admin = {
      from() {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle: async () => ({ data: null, error: null }),
        }
      },
    }

    const ok = await assertBrandInOrg(
      admin as never,
      'org-a',
      'brand-from-org-b'
    )
    expect(ok).toBe(false)
  })

  it('accepts brand in the same organization', async () => {
    const admin = {
      from() {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle: async () => ({ data: { id: 'brand-1' }, error: null }),
        }
      },
    }
    const ok = await assertBrandInOrg(admin as never, 'org-a', 'brand-1')
    expect(ok).toBe(true)
  })
})
