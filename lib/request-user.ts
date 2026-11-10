import { headers } from 'next/headers'
import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js'
import { extractUserAccessJwt } from '@/lib/user-access-jwt'

/**
 * Cookie session first. If the browser has no user, accept a Supabase user JWT
 * from Authorization so the native app can call the same route handlers.
 */
export async function getRequestUser(
  supabase: SupabaseClient
): Promise<{ user: User | null; error: AuthError | null }> {
  const cookie = await supabase.auth.getUser()
  if (cookie.data.user) return { user: cookie.data.user, error: null }

  let authorization: string | null = null
  try {
    authorization = (await headers()).get('authorization')
  } catch {
    authorization = null
  }

  const jwt = extractUserAccessJwt(authorization)
  if (!jwt) return { user: null, error: cookie.error }

  const bearer = await supabase.auth.getUser(jwt)
  return { user: bearer.data.user, error: bearer.error }
}
