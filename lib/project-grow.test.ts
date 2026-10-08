import { describe, expect, it } from 'vitest'
import { resolveGrowMerchant } from '@/lib/project-grow'

describe('resolveGrowMerchant', () => {
  it('prefers project merchant over client fallback', () => {
    const resolved = resolveGrowMerchant({
      project: { grow_enabled: true, grow_user_id: 'proj-uid' },
      client: { grow_enabled: true, grow_user_id: 'client-uid' },
      projectId: 'p1',
    })
    expect(resolved).toEqual({
      userId: 'proj-uid',
      source: 'project',
      projectId: 'p1',
      enabled: true,
    })
  })

  it('falls back to client when project not configured', () => {
    const resolved = resolveGrowMerchant({
      project: { grow_enabled: false, grow_user_id: null },
      client: { grow_enabled: true, grow_user_id: 'client-uid' },
      projectId: 'p1',
    })
    expect(resolved?.source).toBe('client')
    expect(resolved?.userId).toBe('client-uid')
  })

  it('returns null when neither configured', () => {
    expect(
      resolveGrowMerchant({
        project: null,
        client: { grow_enabled: false, grow_user_id: null },
      })
    ).toBeNull()
  })
})
