import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const fetchWithTimeout = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Singleton — reused across warm invocations of the same serverless instance
let _client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    const envVars = Object.keys(process.env).filter((k) => k.includes('SUPABASE')).join(', ')
    throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL. Available env vars: ${envVars || 'none'}`)
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.')
  }
  if (!supabaseUrl.startsWith('https://') && !supabaseUrl.startsWith('http://')) {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL format: ${supabaseUrl}`)
  }

  _client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    global: { fetch: fetchWithTimeout },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 0 } },
  })

  return _client
}
