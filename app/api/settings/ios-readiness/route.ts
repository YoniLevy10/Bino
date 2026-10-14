import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { buildIosReadinessReport } from '@/lib/ios-readiness'
import { BINO_PUBLIC_ORIGIN } from '@/lib/public-origin'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  let aasaHttpOk: boolean | null = null
  try {
    const url = `${BINO_PUBLIC_ORIGIN}/.well-known/apple-app-site-association`
    const res = await fetchWithTimeout(url, { method: 'GET' }, 8_000)
    if (res) {
      aasaHttpOk = res.ok
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { applinks?: unknown } | null
        aasaHttpOk = Boolean(json && typeof json === 'object' && 'applinks' in json)
      }
    }
  } catch {
    aasaHttpOk = null
  }

  const report = buildIosReadinessReport({ aasaHttpOk })
  return NextResponse.json(report)
}
