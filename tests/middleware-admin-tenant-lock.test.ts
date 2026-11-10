/**
 * Lock: middleware tenant resolution must keep using getSupabaseAdmin() (service role).
 * Regression class: session-JWT tenant resolve → CLIENTS_ACTIVE_QUERY_FAILED / login lockout.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('middleware tenant resolution — admin lock', () => {
  const src = readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8')

  it('imports getSupabaseAdmin from supabase-admin', () => {
    expect(src).toContain("import { getSupabaseAdmin } from '@/lib/supabase-admin'")
  })

  it('calls getSupabaseAdmin() for tenant chain (not session JWT client)', () => {
    const calls = src.match(/getSupabaseAdmin\(\)/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3)
  })

  it('does not resolve tenants via createServerClient for clients.is_active filtering path alone', () => {
    // Soft guard: tenant listClientIdsForUserId must be paired with admin in this file.
    expect(src).toContain('listClientIdsForUserId')
    expect(src).toMatch(/const admin = getSupabaseAdmin\(\)[\s\S]*listClientIdsForUserId/)
  })
})
