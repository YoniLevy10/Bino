import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_FIXLY_SUPABASE_URL,
  FIXLY_DIRECTORY_PAGE_SIZE,
  fixlyDirectoryOrFilter,
  type FixlyDirectoryPerson,
} from '@/lib/fixly/pro-waitlist-directory'

/**
 * Server-only Fixly admin client. Do not import this file from client components.
 * The service role can read the whole Fixly database; callers must stay on
 * `pro_waitlist` with `audience = professional`.
 */

type WaitlistRow = {
  id?: string | null
  full_name?: string | null
  phone?: string | null
  email?: string | null
  category?: string | null
  city?: string | null
  created_at?: string | null
}

const fetchWithTimeout = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

let fixlyAdmin: SupabaseClient | null = null

export function fixlyDirectoryConfig(): { url: string; serviceRoleKey: string } | null {
  const serviceRoleKey = process.env.FIXLY_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceRoleKey) return null
  const url = (process.env.FIXLY_SUPABASE_URL?.trim() || DEFAULT_FIXLY_SUPABASE_URL).replace(/\/$/, '')
  if (!url.startsWith('https://')) return null
  return { url, serviceRoleKey }
}

function getFixlyAdmin(): SupabaseClient | null {
  const cfg = fixlyDirectoryConfig()
  if (!cfg) return null
  if (fixlyAdmin) return fixlyAdmin
  fixlyAdmin = createClient(cfg.url, cfg.serviceRoleKey, {
    global: { fetch: fetchWithTimeout },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return fixlyAdmin
}

function mapWaitlistRow(row: WaitlistRow): FixlyDirectoryPerson | null {
  const id = row.id?.trim()
  const fullName = row.full_name?.trim()
  const phone = row.phone?.trim()
  if (!id || !fullName || !phone) return null
  return {
    id,
    full_name: fullName,
    phone,
    email: row.email?.trim() || null,
    category: row.category?.trim() || null,
    city: row.city?.trim() || null,
    created_at: row.created_at ?? '',
  }
}

/**
 * Professionals who signed up on Fixly (`pro_waitlist.audience = professional`).
 * Customers on the same table are never returned. At most 40 rows.
 */
export async function listFixlyProfessionals(
  rawQuery: string | null | undefined
): Promise<{ rows: FixlyDirectoryPerson[]; hasMore: boolean }> {
  const admin = getFixlyAdmin()
  if (!admin) return { rows: [], hasMore: false }

  const limit = FIXLY_DIRECTORY_PAGE_SIZE
  let query = admin
    .from('pro_waitlist')
    .select('id, full_name, phone, email, category, city, created_at')
    .eq('audience', 'professional')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  const orFilter = fixlyDirectoryOrFilter(rawQuery)
  if (orFilter) query = query.or(orFilter)

  const { data, error } = await query
  if (error) {
    console.error('FIXLY_DIRECTORY_QUERY_FAILED', error.message)
    throw new Error('FIXLY_DIRECTORY_QUERY_FAILED')
  }

  const rows = ((data ?? []) as WaitlistRow[])
    .map(mapWaitlistRow)
    .filter((row): row is FixlyDirectoryPerson => row != null)
  return {
    rows: rows.slice(0, limit),
    hasMore: rows.length > limit,
  }
}
