import { describe, expect, it } from 'vitest'
import {
  decideResidentIntakeUpsert,
  isPostgresUniqueViolation,
} from '@/lib/resident-intake-upsert'

describe('decideResidentIntakeUpsert', () => {
  const projectA = 'project-a'
  const projectB = 'project-b'

  it('inserts when no candidates', () => {
    expect(decideResidentIntakeUpsert({ targetProjectId: projectA, candidates: [] })).toEqual({
      action: 'insert',
    })
  })

  it('updates active same-project resident', () => {
    expect(
      decideResidentIntakeUpsert({
        targetProjectId: projectA,
        candidates: [{ id: 'r1', project_id: projectA, deleted_at: null }],
      })
    ).toEqual({ action: 'update', residentId: 'r1', revive: false })
  })

  it('revives soft-deleted same-project resident', () => {
    expect(
      decideResidentIntakeUpsert({
        targetProjectId: projectA,
        candidates: [{ id: 'r2', project_id: projectA, deleted_at: '2026-01-01T00:00:00Z' }],
      })
    ).toEqual({ action: 'update', residentId: 'r2', revive: true })
  })

  it('prefers active over soft-deleted in same project', () => {
    expect(
      decideResidentIntakeUpsert({
        targetProjectId: projectA,
        candidates: [
          { id: 'deleted', project_id: projectA, deleted_at: '2026-01-01T00:00:00Z' },
          { id: 'active', project_id: projectA, deleted_at: null },
        ],
      })
    ).toEqual({ action: 'update', residentId: 'active', revive: false })
  })

  it('conflicts when phone is active in another project', () => {
    expect(
      decideResidentIntakeUpsert({
        targetProjectId: projectA,
        candidates: [{ id: 'r3', project_id: projectB, deleted_at: null }],
      })
    ).toEqual({
      action: 'conflict_other_project',
      residentId: 'r3',
      otherProjectId: projectB,
    })
  })

  it('revives and moves soft-deleted resident from another project', () => {
    expect(
      decideResidentIntakeUpsert({
        targetProjectId: projectA,
        candidates: [{ id: 'r4', project_id: projectB, deleted_at: '2026-01-01T00:00:00Z' }],
      })
    ).toEqual({ action: 'update', residentId: 'r4', revive: true })
  })
})

describe('isPostgresUniqueViolation', () => {
  it('detects 23505 and message variants', () => {
    expect(isPostgresUniqueViolation({ code: '23505' })).toBe(true)
    expect(isPostgresUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(
      true
    )
    expect(isPostgresUniqueViolation({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isPostgresUniqueViolation(null)).toBe(false)
  })
})
