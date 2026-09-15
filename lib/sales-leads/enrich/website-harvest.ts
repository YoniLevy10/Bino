/**
 * Harvest contact channels from a lead's own website (emails, wa.me, phones).
 * Respects robots.txt Disallow for / and /contact when present.
 * Never used for cold automated outreach — enrichment for manual sales only.
 */

import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { normalizePhone } from '@/lib/sales-leads/phone'

export type WebsiteHarvestResult = {
  emails: string[]
  whatsappPhones: string[]
  phones: string[]
  pagesFetched: string[]
  robotsBlocked: boolean
  error?: string
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const WA_ME_RE = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d{8,15})/gi
const PHONE_RE =
  /(?:\+972[\s-]?\d[\s-]?\d{3}[\s-]?\d{4}|0\d{1,2}[\s-]?\d{3}[\s-]?\d{4}|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b)/g

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function normalizeSiteUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`
    const u = new URL(withProto)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Minimal robots.txt check — blocks harvest if User-agent: * Disallow: / */
export async function isRobotsBlocked(siteUrl: string): Promise<boolean> {
  const origin = originOf(siteUrl)
  if (!origin) return true
  const res = await fetchWithTimeout(`${origin}/robots.txt`, {}, 4_000)
  if (!res || !res.ok) return false
  const text = await res.text().catch(() => '')
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  let inStar = false
  for (const line of lines) {
    if (/^user-agent:\s*\*/i.test(line)) {
      inStar = true
      continue
    }
    if (/^user-agent:/i.test(line)) {
      inStar = false
      continue
    }
    if (inStar && /^disallow:\s*\/\s*$/i.test(line)) return true
  }
  return false
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

export function extractContactsFromHtml(html: string): Omit<WebsiteHarvestResult, 'pagesFetched' | 'robotsBlocked'> {
  const emails = unique((html.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())).filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('example.com'),
  )

  const whatsappPhones: string[] = []
  for (const m of html.matchAll(WA_ME_RE)) {
    const n = normalizePhone(m[1])
    if (n) whatsappPhones.push(n)
  }

  const phones: string[] = []
  for (const m of html.match(PHONE_RE) ?? []) {
    const n = normalizePhone(m)
    if (n) phones.push(n)
  }

  return {
    emails: emails.slice(0, 8),
    whatsappPhones: unique(whatsappPhones).slice(0, 5),
    phones: unique(phones).slice(0, 8),
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'BINO-SalesEnrichment/1.0 (+https://bino; contact research only)',
      },
    },
    8_000,
  )
  if (!res || !res.ok) return null
  const ctype = res.headers.get('content-type') || ''
  if (ctype && !/text\/html|application\/xhtml/i.test(ctype) && !ctype.includes('text/plain')) {
    return null
  }
  return res.text().catch(() => null)
}

export async function harvestWebsiteContacts(websiteUrl: string): Promise<WebsiteHarvestResult> {
  const empty: WebsiteHarvestResult = {
    emails: [],
    whatsappPhones: [],
    phones: [],
    pagesFetched: [],
    robotsBlocked: false,
  }

  const base = normalizeSiteUrl(websiteUrl)
  if (!base) return { ...empty, error: 'invalid_url' }

  try {
    if (await isRobotsBlocked(base)) {
      return { ...empty, robotsBlocked: true, error: 'robots_disallow' }
    }

    const origin = originOf(base)!
    const paths = [base, `${origin}/contact`, `${origin}/contact-us`, `${origin}/צור-קשר`]
    const emails: string[] = []
    const whatsappPhones: string[] = []
    const phones: string[] = []
    const pagesFetched: string[] = []

    for (const page of paths) {
      const html = await fetchHtml(page)
      if (!html) continue
      pagesFetched.push(page)
      const found = extractContactsFromHtml(html)
      emails.push(...found.emails)
      whatsappPhones.push(...found.whatsappPhones)
      phones.push(...found.phones)
      if (emails.length && (whatsappPhones.length || phones.length)) break
    }

    return {
      emails: unique(emails).slice(0, 8),
      whatsappPhones: unique(whatsappPhones).slice(0, 5),
      phones: unique(phones).slice(0, 8),
      pagesFetched,
      robotsBlocked: false,
    }
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : 'harvest_failed',
    }
  }
}
