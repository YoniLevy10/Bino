/**
 * One Zero identity/GraphQL sit behind Cloudflare. Node's default TLS JA3 is
 * blocked (403 HTML "Attention Required"). undici + OkHttp cipher order matches
 * the Android app fingerprint (upstream PR #1126, not yet on npm 6.13).
 */
import { Agent, fetch as undiciFetch } from 'undici'

const ANDROID_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':')

const ANDROID_SIGALGS = [
  'ecdsa_secp256r1_sha256',
  'rsa_pss_rsae_sha256',
  'rsa_pkcs1_sha256',
  'ecdsa_secp384r1_sha384',
  'rsa_pss_rsae_sha384',
  'rsa_pkcs1_sha384',
  'rsa_pss_rsae_sha512',
  'rsa_pkcs1_sha512',
].join(':')

const mobileAgent = new Agent({
  connect: {
    ciphers: ANDROID_CIPHERS,
    sigalgs: ANDROID_SIGALGS,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
  },
})

const MOBILE_HEADERS = {
  'User-Agent': 'okhttp/4.10.0',
  'Accept-Encoding': 'gzip',
  Connection: 'Keep-Alive',
}

async function parseJsonOrThrow(response, url) {
  const text = await response.text()
  if (
    response.status === 403 ||
    /<!DOCTYPE|Attention Required|cf-browser-verification|cloudflare/i.test(text)
  ) {
    throw new Error(
      `Cloudflare blocked One Zero (${response.status}) at ${url}. Need Android TLS fingerprint.`
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `One Zero returned non-JSON (${response.status}): ${text.slice(0, 120)}`
    )
  }
}

/** Drop accidental // after /v1/ from upstream IDENTITY_SERVER_URL trailing slash. */
function normalizeOneZeroUrl(url) {
  return String(url).replace(/\/v1\/\/+/g, '/v1/')
}

export async function mobileFetchPost(url, data, extraHeaders = {}) {
  const target = normalizeOneZeroUrl(url)
  const response = await undiciFetch(target, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...MOBILE_HEADERS,
      ...extraHeaders,
    },
    body: JSON.stringify(data),
    dispatcher: mobileAgent,
  })
  return parseJsonOrThrow(response, target)
}

export async function mobileFetchGraphql(url, query, variables = {}, extraHeaders = {}) {
  const result = await mobileFetchPost(
    url,
    { operationName: null, query, variables },
    extraHeaders
  )
  if (result.errors?.length) {
    throw new Error(result.errors[0].message)
  }
  return result.data
}
