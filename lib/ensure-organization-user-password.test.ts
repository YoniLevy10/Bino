import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureOrganizationUserWithPassword } from '@/lib/ensure-organization-user-password'

function mockAdmin(opts: {
  orgId?: string | null
  existingUserId?: string | null
  createError?: string | null
  updateError?: string | null
  upsertError?: string | null
}) {
  const orgId = opts.orgId === undefined ? 'org-1' : opts.orgId
  const listUsers = vi.fn().mockResolvedValue({
    data: {
      users: opts.existingUserId
        ? [{ id: opts.existingUserId, email: 'sarah@bamakor.com' }]
        : [],
    },
    error: null,
  })
  const createUser = vi.fn().mockResolvedValue(
    opts.createError
      ? { data: { user: null }, error: { message: opts.createError } }
      : { data: { user: { id: 'new-user' } }, error: null }
  )
  const updateUserById = vi.fn().mockResolvedValue(
    opts.updateError ? { data: { user: null }, error: { message: opts.updateError } } : { data: {}, error: null }
  )
  const upsert = vi.fn().mockResolvedValue({
    error: opts.upsertError ? { message: opts.upsertError } : null,
  })

  const from = vi.fn((table: string) => {
    if (table === 'organizations') {
      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: orgId ? [{ id: orgId }] : [],
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'organization_users') {
      return { upsert }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return {
    admin: {
      from,
      auth: { admin: { listUsers, createUser, updateUserById } },
    } as never,
    listUsers,
    createUser,
    updateUserById,
    upsert,
  }
}

describe('ensureOrganizationUserWithPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects short passwords', async () => {
    const { admin } = mockAdmin({})
    const result = await ensureOrganizationUserWithPassword(admin, {
      clientId: 'c1',
      email: 'sarah@bamakor.com',
      password: 'short',
      role: 'admin',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/8/)
  })

  it('creates a new confirmed password user and links the org', async () => {
    const { admin, createUser, upsert } = mockAdmin({ existingUserId: null })
    const result = await ensureOrganizationUserWithPassword(admin, {
      clientId: 'c1',
      email: 'Sarah@bamakor.com',
      password: 'navot0606',
      role: 'admin',
      fullName: 'שרה נבות',
    })
    expect(result).toEqual({
      ok: true,
      userId: 'new-user',
      email: 'sarah@bamakor.com',
      role: 'admin',
      created: true,
    })
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'sarah@bamakor.com',
        password: 'navot0606',
        email_confirm: true,
      })
    )
    expect(upsert).toHaveBeenCalledWith(
      { organization_id: 'org-1', user_id: 'new-user', role: 'admin' },
      { onConflict: 'organization_id,user_id' }
    )
  })

  it('updates password for an existing auth user', async () => {
    const { admin, createUser, updateUserById } = mockAdmin({ existingUserId: 'existing-1' })
    const result = await ensureOrganizationUserWithPassword(admin, {
      clientId: 'c1',
      email: 'sarah@bamakor.com',
      password: 'navot0606',
      role: 'manager',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.created).toBe(false)
      expect(result.userId).toBe('existing-1')
    }
    expect(createUser).not.toHaveBeenCalled()
    expect(updateUserById).toHaveBeenCalledWith(
      'existing-1',
      expect.objectContaining({ password: 'navot0606', email_confirm: true })
    )
  })
})
