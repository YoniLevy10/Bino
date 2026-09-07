import { describe, expect, it } from 'vitest'
import { updateWorkerBodySchema } from '@/lib/api-body-schemas'

describe('updateWorkerBodySchema', () => {
  it('accepts is_active-only deactivate payload (השבת עובד)', () => {
    const parsed = updateWorkerBodySchema.safeParse({
      worker_id: '11111111-1111-4111-8111-111111111111',
      is_active: false,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts soft_delete without other fields', () => {
    const parsed = updateWorkerBodySchema.safeParse({
      worker_id: '11111111-1111-4111-8111-111111111111',
      soft_delete: true,
    })
    expect(parsed.success).toBe(true)
  })
})
