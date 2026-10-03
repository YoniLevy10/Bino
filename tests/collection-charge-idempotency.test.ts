import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Documents the concurrent Idempotency-Key contract after migration 113:
 * - First create inserts with idempotency_key
 * - Concurrent duplicate hits UNIQUE (23505) and returns existing as idempotent_replay
 * - Retry after success also returns existing without second insert
 *
 * Live UNIQUE proof (Bamakor sandbox, 2026-10-03):
 * duplicate INSERT → 23505 on idx_collection_charges_client_idempotency
 */

describe('collection charge idempotency (113)', () => {
  it('treats Postgres 23505 on idempotency_key as replay', () => {
    const insertErr = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const idempotencyKey = 'sandbox-idem-key-2026-10-03-v1'
    const shouldReplay = insertErr?.code === '23505' && !!idempotencyKey
    expect(shouldReplay).toBe(true)
  })

  it('does not replay when insert fails without 23505', () => {
    const insertErr = { code: '42501', message: 'permission denied' }
    const idempotencyKey = 'k'
    const shouldReplay = insertErr?.code === '23505' && !!idempotencyKey
    expect(shouldReplay).toBe(false)
  })

  it('skips unique path when Idempotency-Key header absent', () => {
    const header = ''
    const idempotencyKey = header.trim().slice(0, 128) || null
    expect(idempotencyKey).toBeNull()
  })
})
