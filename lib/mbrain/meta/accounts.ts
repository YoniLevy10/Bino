/**
 * Discover Meta ad accounts, pages, pixels for the connected user.
 */
import { getMetaGraphBaseUrl, getMetaMode, getMetaDataLabel, type MetaDataLabel } from './client'

export type MetaAdAccount = {
  id: string
  name: string
  currency: string
  account_status: number
}

export type MetaPage = {
  id: string
  name: string
  access_token?: string
}

export type MetaPixel = {
  id: string
  name: string
}

export async function listAdAccounts(accessToken: string | null): Promise<{
  label: MetaDataLabel
  accounts: MetaAdAccount[]
}> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !accessToken) {
    return {
      label,
      accounts: [
        {
          id: 'act_mock_bamakor',
          name: 'Bamakor Mock Ad Account',
          currency: 'ILS',
          account_status: 1,
        },
      ],
    }
  }

  const url = new URL(`${getMetaGraphBaseUrl()}/me/adaccounts`)
  url.searchParams.set('fields', 'id,name,currency,account_status')
  url.searchParams.set('limit', '100')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { data?: MetaAdAccount[]; error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || `adaccounts failed (${res.status})`)
  return { label, accounts: json.data ?? [] }
}

export async function listPages(accessToken: string | null): Promise<{
  label: MetaDataLabel
  pages: MetaPage[]
}> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !accessToken) {
    return {
      label,
      pages: [{ id: 'page_mock_bamakor', name: 'Bamakor Page (Mock)' }],
    }
  }
  const url = new URL(`${getMetaGraphBaseUrl()}/me/accounts`)
  url.searchParams.set('fields', 'id,name,access_token')
  url.searchParams.set('limit', '100')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { data?: MetaPage[]; error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || `pages failed (${res.status})`)
  return { label, pages: json.data ?? [] }
}

export async function listPixels(
  accessToken: string | null,
  adAccountId: string
): Promise<{ label: MetaDataLabel; pixels: MetaPixel[] }> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !accessToken) {
    return { label, pixels: [{ id: 'pixel_mock', name: 'Mock Pixel' }] }
  }
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const url = new URL(`${getMetaGraphBaseUrl()}/${accountId}/adspixels`)
  url.searchParams.set('fields', 'id,name')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { data?: MetaPixel[]; error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || `pixels failed (${res.status})`)
  return { label, pixels: json.data ?? [] }
}
