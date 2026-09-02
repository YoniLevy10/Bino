/**
 * Meta adapter skeleton — official Graph API only; mock vs live labeled.
 */
export type MetaMode = 'mock' | 'live'

export function getMetaMode(): MetaMode {
  const mode = (process.env.META_MODE ?? 'mock').toLowerCase()
  return mode === 'live' ? 'live' : 'mock'
}

export function getMetaGraphApiVersion(): string {
  // Centralized — override via env; never hardcode an obsolete default in call sites.
  return process.env.META_GRAPH_API_VERSION ?? 'v21.0'
}

export function getMetaGraphBaseUrl(): string {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`
}

export type MetaDataLabel = 'MOCK DATA' | 'LIVE META DATA'

export function getMetaDataLabel(): MetaDataLabel {
  return getMetaMode() === 'live' ? 'LIVE META DATA' : 'MOCK DATA'
}

export type MetaAdAccountSummary = {
  id: string
  name: string
  currency: string
  account_status: number
}

/** Discovery used by Integrations UI — mock returns labeled fixtures. */
export async function listAdAccounts(accessToken: string | null): Promise<{
  label: MetaDataLabel
  accounts: MetaAdAccountSummary[]
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
  url.searchParams.set('limit', '50')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Meta adaccounts failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { data?: MetaAdAccountSummary[] }
  return { label, accounts: json.data ?? [] }
}
