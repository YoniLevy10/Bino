import { createClient } from '@supabase/supabase-js'

const fetchWithTimeout = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // More detailed error messages for debugging
  if (!supabaseUrl) {
    const envVars = Object.keys(process.env)
      .filter((k) => k.includes('SUPABASE'))
      .join(', ')
    throw new Error(
      `Missing NEXT_PUBLIC_SUPABASE_URL. Available env vars: ${envVars || 'none'}`
    )
  }

  if (!supabaseServiceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Ensure this secret key is set in production environment variables.'
    )
  }

  if (!supabaseUrl.startsWith('https://') && !supabaseUrl.startsWith('http://')) {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL format: ${supabaseUrl}`)
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    global: { fetch: fetchWithTimeout },
  })
}
