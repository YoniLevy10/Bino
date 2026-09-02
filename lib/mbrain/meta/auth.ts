/**
 * Meta OAuth (Facebook Login for Business / Marketing API scopes).
 */
import { getMetaGraphApiVersion, getMetaGraphBaseUrl } from './client'

const DEFAULT_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
].join(',')

export function getMetaAppId(): string {
  const id = process.env.META_APP_ID
  if (!id) throw new Error('META_APP_ID missing — set in Vercel / .env.local')
  return id
}

export function getMetaAppSecret(): string {
  const secret = process.env.META_APP_SECRET
  if (!secret) throw new Error('META_APP_SECRET missing')
  return secret
}

export function getMetaOAuthRedirectUri(): string {
  return (
    process.env.META_OAUTH_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/mbrain/meta/oauth/callback`
  )
}

export function buildMetaOAuthUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${getMetaGraphApiVersion()}/dialog/oauth`)
  url.searchParams.set('client_id', getMetaAppId())
  url.searchParams.set('redirect_uri', getMetaOAuthRedirectUri())
  url.searchParams.set('state', state)
  url.searchParams.set('scope', process.env.META_OAUTH_SCOPES ?? DEFAULT_SCOPES)
  url.searchParams.set('response_type', 'code')
  return url.toString()
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string
  expiresIn?: number
  tokenType?: string
}> {
  const url = new URL(`${getMetaGraphBaseUrl()}/oauth/access_token`)
  url.searchParams.set('client_id', getMetaAppId())
  url.searchParams.set('client_secret', getMetaAppSecret())
  url.searchParams.set('redirect_uri', getMetaOAuthRedirectUri())
  url.searchParams.set('code', code)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    token_type?: string
    error?: { message?: string }
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error?.message || `OAuth token exchange failed (${res.status})`)
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in,
    tokenType: json.token_type,
  }
}

export async function exchangeForLongLivedToken(shortLived: string): Promise<{
  accessToken: string
  expiresIn?: number
}> {
  const url = new URL(`${getMetaGraphBaseUrl()}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', getMetaAppId())
  url.searchParams.set('client_secret', getMetaAppSecret())
  url.searchParams.set('fb_exchange_token', shortLived)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: { message?: string }
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error?.message || `Long-lived token exchange failed (${res.status})`)
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in }
}

export async function fetchMetaMe(accessToken: string): Promise<{ id: string; name?: string }> {
  const url = new URL(`${getMetaGraphBaseUrl()}/me`)
  url.searchParams.set('fields', 'id,name')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  })
  const json = (await res.json()) as { id?: string; name?: string; error?: { message?: string } }
  if (!res.ok || !json.id) throw new Error(json.error?.message || 'Failed to fetch Meta user')
  return { id: json.id, name: json.name }
}
