export type SalesLeadSourceRef = {
  source: string
  externalId?: string | null
  url?: string | null
  seenAt: string
}

export function normalizeWebsiteHost(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const raw = url.trim()
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const u = new URL(withProto)
    if (!u.hostname) return null
    return u.hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

export function isMapsOrDirectoryUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true
  try {
    const host = normalizeWebsiteHost(url) ?? ''
    const blocked = [
      'google.com',
      'googleapis.com',
      'maps.app.goo.gl',
      'goo.gl',
      'facebook.com',
      'instagram.com',
      'linkedin.com',
      'b144.co.il',
      'd.co.il',
      'zap.co.il',
      'midrag.co.il',
      'easy.co.il',
      'goldenpages.co.il',
    ]
    return blocked.some((b) => host === b || host.endsWith(`.${b}`))
  } catch {
    return true
  }
}

export function pickWebsiteUrl(
  websiteUrl?: string | null,
  sourceUrl?: string | null,
): string | null {
  for (const cand of [websiteUrl, sourceUrl]) {
    if (!cand?.trim()) continue
    if (!/^https?:\/\//i.test(cand.trim())) continue
    if (isMapsOrDirectoryUrl(cand)) continue
    return cand.trim()
  }
  return null
}

export function mergeSourceRefs(
  existing: SalesLeadSourceRef[] | null | undefined,
  incoming: SalesLeadSourceRef,
): SalesLeadSourceRef[] {
  const list = Array.isArray(existing) ? [...existing] : []
  const key = `${incoming.source}::${incoming.externalId ?? ''}`
  const idx = list.findIndex((r) => `${r.source}::${r.externalId ?? ''}` === key)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...incoming, seenAt: incoming.seenAt }
  } else {
    list.push(incoming)
  }
  return list.slice(0, 40)
}
