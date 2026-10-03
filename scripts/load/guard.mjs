/**
 * Safety gate for isolated load tests.
 * NEVER allow load against bino.casa. Block Supabase project hosts unless
 * ALLOW_PROD_LOAD=I_UNDERSTAND (still refuses bino.casa).
 */

export const SANDBOX_LOAD_CLIENT_ID = 'a1111111-1111-4111-8111-111111111111'

/** Known production Bamakor Supabase project ref — load must not target it. */
export const PROD_SUPABASE_PROJECT_REFS = ['jsliqlmjksintyigkulq']

const ALLOW_PROD_TOKEN = 'I_UNDERSTAND'

/**
 * @param {string} baseUrl
 * @param {{ allowProdLoad?: string | undefined, envSupabaseUrl?: string | undefined }} [opts]
 * @returns {{ ok: true, baseUrl: string } | { ok: false, reason: string }}
 */
export function assertSafeBaseUrl(baseUrl, opts = {}) {
  const raw = (baseUrl ?? '').trim()
  if (!raw) {
    return { ok: false, reason: 'BASE_URL is empty; default is http://127.0.0.1:3000' }
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: `BASE_URL is not a valid URL: ${raw}` }
  }

  const host = parsed.hostname.toLowerCase()
  const href = parsed.href.toLowerCase()
  const origin = parsed.origin.toLowerCase()

  // Absolute ban — never overridden.
  if (host === 'bino.casa' || host.endsWith('.bino.casa') || href.includes('bino.casa')) {
    return {
      ok: false,
      reason:
        'BASE_URL targets bino.casa — refused always (even with ALLOW_PROD_LOAD). Use local Next (http://127.0.0.1:3000) or a dedicated non-prod host.',
    }
  }

  if (origin === 'https://bino.casa' || origin === 'http://bino.casa') {
    return { ok: false, reason: 'BASE_URL must not equal https://bino.casa (or http).' }
  }

  const supabaseHits = collectSupabaseHits(raw, host, opts.envSupabaseUrl)
  const allowProd = (opts.allowProdLoad ?? '').trim() === ALLOW_PROD_TOKEN

  if (supabaseHits.length > 0 && !allowProd) {
    return {
      ok: false,
      reason:
        `BASE_URL appears to target a Supabase / Bamakor project host (${supabaseHits.join(', ')}). ` +
        'Load tests must use local app + local Supabase. To override a non-bino.casa staging host only, set ALLOW_PROD_LOAD=I_UNDERSTAND (still refuses bino.casa).',
    }
  }

  return {
    ok: true,
    baseUrl: parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')),
  }
}

/**
 * @param {string} raw
 * @param {string} host
 * @param {string | undefined} envSupabaseUrl
 */
function collectSupabaseHits(raw, host, envSupabaseUrl) {
  /** @type {string[]} */
  const hits = []
  const lower = raw.toLowerCase()

  if (host.endsWith('.supabase.co') || host === 'supabase.co' || lower.includes('.supabase.co')) {
    hits.push(host || 'supabase.co')
  }

  for (const ref of PROD_SUPABASE_PROJECT_REFS) {
    if (lower.includes(ref)) hits.push(`project:${ref}`)
  }

  if (envSupabaseUrl) {
    try {
      const envHost = new URL(envSupabaseUrl).hostname.toLowerCase()
      if (envHost && (host === envHost || lower.includes(envHost))) {
        hits.push(`env-supabase:${envHost}`)
      }
    } catch {
      /* ignore malformed env */
    }
  }

  return [...new Set(hits)]
}

/**
 * Public report create-ticket writes are gated separately.
 * @param {{ allowWrites?: string, clientId?: string }} opts
 */
export function assertWriteScenarioAllowed(opts) {
  if ((opts.allowWrites ?? '').trim() !== '1') {
    return {
      ok: false,
      reason: 'Write scenario skipped: set LOAD_ALLOW_WRITES=1 to enable public report create-ticket load.',
    }
  }
  const clientId = (opts.clientId ?? '').trim()
  if (clientId !== SANDBOX_LOAD_CLIENT_ID) {
    return {
      ok: false,
      reason:
        `Write scenario refused: client_id must be sandbox UUID ${SANDBOX_LOAD_CLIENT_ID} (got ${clientId || '(empty)'}). ` +
        'Even sandbox rows on the production DB must NOT be used for load — point BASE_URL at local only.',
    }
  }
  return { ok: true }
}

/**
 * Resolve BASE_URL from env with default. Throws on hard-fail.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveBaseUrlOrExit(env = process.env) {
  const base = (env.BASE_URL ?? 'http://127.0.0.1:3000').trim()
  const result = assertSafeBaseUrl(base, {
    allowProdLoad: env.ALLOW_PROD_LOAD,
    envSupabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  })
  if (!result.ok) {
    const err = new Error(`[load-guard] HARD FAIL: ${result.reason}`)
    // @ts-expect-error custom
    err.code = 'LOAD_GUARD_FAIL'
    throw err
  }
  return result.baseUrl
}
