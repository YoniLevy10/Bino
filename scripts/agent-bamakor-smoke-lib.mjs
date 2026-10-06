/**
 * Pure helpers + runner for Bamakor agent smoke (testable without network).
 */

export const CANONICAL_ORIGIN = 'https://bino.casa'
export const DEFAULT_BAMAKOR_ORIGIN = 'https://bamakor.vercel.app'

/**
 * @param {string} baseUrl
 * @returns {{ ok: true, origin: string } | { ok: false, reason: string }}
 */
export function assertBamakorSmokeBase(baseUrl) {
  const raw = (baseUrl ?? '').trim()
  if (!raw) {
    return { ok: false, reason: 'BAMAKOR_SMOKE_BASE is empty' }
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: `Invalid URL: ${raw}` }
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Smoke base must be https' }
  }

  const host = parsed.hostname.toLowerCase()
  const allowed =
    host === 'bamakor.vercel.app' ||
    host === 'bino.casa' ||
    (host.endsWith('.vercel.app') && process.env.BAMAKOR_SMOKE_ALLOW_PREVIEW === '1')

  if (!allowed) {
    return {
      ok: false,
      reason:
        `Refusing smoke base host "${host}". Use https://bamakor.vercel.app ` +
        '(or set BAMAKOR_SMOKE_ALLOW_PREVIEW=1 for a *.vercel.app preview host).',
    }
  }

  return { ok: true, origin: parsed.origin }
}

/**
 * @param {number} status
 * @param {string} locationHeader
 * @param {string} canonicalLogin
 */
export function expectLoginRedirect(status, locationHeader, canonicalLogin = `${CANONICAL_ORIGIN}/login`) {
  if (status !== 308 && status !== 301 && status !== 302 && status !== 307) {
    return { ok: false, detail: `expected redirect status, got ${status}` }
  }
  const loc = (locationHeader || '').trim()
  if (!loc) return { ok: false, detail: 'missing Location header' }
  let absolute
  try {
    absolute = new URL(loc, CANONICAL_ORIGIN).href.replace(/\/$/, '')
  } catch {
    return { ok: false, detail: `bad Location: ${loc}` }
  }
  const expected = canonicalLogin.replace(/\/$/, '')
  if (absolute !== expected && absolute !== `${expected}/`) {
    return { ok: false, detail: `Location ${absolute} !== ${expected}` }
  }
  return { ok: true, detail: `${status} → ${absolute}` }
}

/**
 * @param {number} status
 */
export function expectNotServerError(status) {
  if (status >= 500) return { ok: false, detail: `unexpected 5xx: ${status}` }
  return { ok: true, detail: `status ${status}` }
}

/**
 * @param {number} status
 */
export function expectUnauthorizedCron(status) {
  if (status !== 401) return { ok: false, detail: `expected 401, got ${status}` }
  return { ok: true, detail: '401 without secret' }
}

/**
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} opts
 */
export async function runBamakorSmoke(opts) {
  /** @type {string[]} */
  const lines = []
  const baseCheck = assertBamakorSmokeBase(opts.baseUrl)
  if (!baseCheck.ok) {
    lines.push(`FAIL base: ${baseCheck.reason}`)
    return { ok: false, lines }
  }

  const origin = baseCheck.origin
  const fetchImpl = opts.fetchImpl ?? fetch
  let ok = true

  /**
   * @param {string} name
   * @param {() => Promise<{ ok: boolean, detail: string }>} fn
   */
  async function step(name, fn) {
    try {
      const r = await fn()
      lines.push(`${r.ok ? 'PASS' : 'FAIL'} ${name}: ${r.detail}`)
      if (!r.ok) ok = false
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      lines.push(`FAIL ${name}: ${msg}`)
      ok = false
    }
  }

  await step('bamakor /login → canonical', async () => {
    const res = await fetchImpl(`${origin}/login`, { method: 'GET', redirect: 'manual' })
    return expectLoginRedirect(res.status, res.headers.get('location') || '')
  })

  await step('canonical /login', async () => {
    const res = await fetchImpl(`${CANONICAL_ORIGIN}/login`, { method: 'GET', redirect: 'manual' })
    if (res.status !== 200) return { ok: false, detail: `expected 200, got ${res.status}` }
    return { ok: true, detail: '200' }
  })

  await step('bamakor webhook whatsapp alive', async () => {
    const res = await fetchImpl(`${origin}/api/webhook/whatsapp`, {
      method: 'GET',
      redirect: 'manual',
    })
    return expectNotServerError(res.status)
  })

  await step('bamakor cron health-check auth gate', async () => {
    const res = await fetchImpl(`${origin}/api/cron/health-check`, {
      method: 'GET',
      redirect: 'manual',
    })
    return expectUnauthorizedCron(res.status)
  })

  return { ok, lines }
}
