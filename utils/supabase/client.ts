import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_AUTH_COOKIE_OPTIONS } from '@/lib/supabase-cookie-options'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
  })
}

