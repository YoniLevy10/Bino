/**
 * Building-bank scraper worker — runs israeli-bank-scrapers (Chromium) off Vercel.
 *
 *   BUILDING_BANK_SCRAPER_WORKER_SECRET=... npm run worker:bank-scraper
 *
 * BINO calls:
 *   POST /scrape  { projectId, provider, credentials, startDate? }
 *   POST /otp     { projectId, otp_code }   — while /scrape waits for 2FA
 *   GET  /health
 */

import http from 'node:http'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** @type {Map<string, { resolve:(c:string)=>void, reject:(e:Error)=>void, timer:NodeJS.Timeout }>} */
const waiters = new Map()
/** @type {Map<string, string>} */
const pending = new Map()

const PORT = Number(process.env.PORT || process.env.BUILDING_BANK_SCRAPER_WORKER_PORT || 8787)
const SECRET =
  process.env.BUILDING_BANK_SCRAPER_WORKER_SECRET ||
  process.env.CRON_SECRET ||
  ''

function unauthorized(res) {
  res.writeHead(401, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'Unauthorized' }))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}'
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function authOk(req) {
  if (!SECRET) return false
  const h = req.headers.authorization || ''
  if (h === `Bearer ${SECRET}`) return true
  if (req.headers['x-worker-secret'] === SECRET) return true
  return false
}

function waitOtp(projectId, timeoutMs = 120_000) {
  const existing = pending.get(projectId)
  if (existing) {
    pending.delete(projectId)
    return Promise.resolve(existing)
  }
  return new Promise((resolve, reject) => {
    const prev = waiters.get(projectId)
    if (prev) {
      clearTimeout(prev.timer)
      prev.reject(new Error('המתנה ל־OTP הוחלפה'))
    }
    const timer = setTimeout(() => {
      waiters.delete(projectId)
      reject(new Error('פג הזמן להזנת קוד OTP'))
    }, timeoutMs)
    waiters.set(projectId, { resolve, reject, timer })
  })
}

function submitOtp(projectId, code) {
  const cleaned = String(code || '').replace(/\s+/g, '').trim()
  if (cleaned.length < 4) return { ok: false, error: 'קוד OTP לא תקין' }
  const w = waiters.get(projectId)
  if (w) {
    clearTimeout(w.timer)
    waiters.delete(projectId)
    w.resolve(cleaned)
    return { ok: true }
  }
  pending.set(projectId, cleaned)
  setTimeout(() => pending.delete(projectId), 120_000)
  return { ok: true }
}

function normalizeOneZeroPhone(raw) {
  if (!raw) return raw
  let s = String(raw).trim().replace(/[\s\-()]/g, '')
  if (!s) return s
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (s.startsWith('+')) return s
  if (s.startsWith('972')) return `+${s}`
  if (s.startsWith('0') && s.length >= 9) return `+972${s.slice(1)}`
  if (/^5\d{8}$/.test(s)) return `+972${s}`
  return `+${s}`
}

function mapScrapeErrorHe(errType, errMsg) {
  if (/international phone|\+ and a three digit/i.test(errMsg)) {
    return 'מספר הטלפון ל־One Zero חייב בפורמט +972… (עם פלוס)'
  }
  if (/Cloudflare|DOCTYPE|Attention Required|WAF|not valid JSON/i.test(errMsg)) {
    return 'One Zero חסום ע״י Cloudflare מהשרת — מנסים עם TLS של אפליקציית אנדרואיד. אם חוזר: נסו שוב או ייבוא CSV.'
  }
  return `משיכת בנק נכשלה: ${errType}${errMsg ? ` — ${errMsg}` : ''}`
}

async function patchOneZeroFetch() {
  const fetchMod = require(
    path.join(root, 'node_modules/israeli-bank-scrapers/lib/helpers/fetch.js')
  )
  const { mobileFetchPost, mobileFetchGraphql } = await import('./one-zero-mobile-fetch.mjs')
  fetchMod.fetchPost = mobileFetchPost
  fetchMod.fetchGraphql = mobileFetchGraphql
  console.log('[bank-scraper-worker] oneZero: patched fetch → Android TLS (undici)')
}

async function runScrape({ projectId, provider, credentials, startDate }) {
  // Resolve package from app root so worker can live without its own node_modules copy.
  const scrapers = require(path.join(root, 'node_modules/israeli-bank-scrapers'))
  const { CompanyTypes, createScraper } = scrapers
  const companyId = CompanyTypes[provider]
  if (!companyId) {
    return { ok: false, error: `בנק לא נתמך: ${provider}`, code: 'SCRAPE_FAILED' }
  }

  const creds = { ...credentials }
  if (provider === 'oneZero') {
    if (creds.phoneNumber) {
      creds.phoneNumber = normalizeOneZeroPhone(creds.phoneNumber)
      console.log('[bank-scraper-worker] oneZero phone normalized to', creds.phoneNumber)
    }
    await patchOneZeroFetch()
  }

  const otpCodeRetriever = async () => {
    console.log('[bank-scraper-worker] waiting for OTP for', projectId)
    return waitOtp(projectId, 120_000)
  }
  const scraper = createScraper({
    companyId,
    startDate: startDate ? new Date(startDate) : new Date(Date.now() - 45 * 86400000),
    combineInstallments: false,
    showBrowser: process.env.BUILDING_BANK_SCRAPER_SHOW_BROWSER === 'true',
    otpTimeoutMs: 120_000,
    otpCodeRetriever,
  })

  const scrapeResult = await scraper.scrape({
    ...creds,
    otpCodeRetriever,
  })

  if (!scrapeResult.success) {
    const errType = String(scrapeResult.errorType || 'unknown')
    const errMsg = String(scrapeResult.errorMessage || '')
    console.error('[bank-scraper-worker] scrape failed', errType, errMsg)
    return { ok: false, error: mapScrapeErrorHe(errType, errMsg), code: 'SCRAPE_FAILED' }
  }

  const rows = []
  for (const account of scrapeResult.accounts || []) {
    const accountNumber = String(account.accountNumber || 'unknown')
    for (const txn of account.txns || []) {
      const charged = Number(txn.chargedAmount)
      if (!Number.isFinite(charged) || charged === 0) continue
      const direction = charged > 0 ? 'credit' : 'debit'
      const amount = Math.abs(charged)
      const bookedRaw = txn.processedDate || txn.date
      let booked_at = null
      if (bookedRaw instanceof Date) booked_at = bookedRaw.toISOString().slice(0, 10)
      else if (typeof bookedRaw === 'string' && bookedRaw) {
        const d = new Date(bookedRaw)
        booked_at = Number.isNaN(d.getTime()) ? bookedRaw.slice(0, 10) : d.toISOString().slice(0, 10)
      }
      const description = [txn.description, txn.memo].filter(Boolean).join(' · ') || null
      const reference =
        txn.identifier != null && String(txn.identifier).trim()
          ? String(txn.identifier)
          : null
      const skBase = [
        accountNumber,
        booked_at || '',
        amount.toFixed(2),
        direction,
        (description || '').slice(0, 80),
        (reference || '').slice(0, 40),
      ].join('|')
      rows.push({
        project_id: projectId,
        booked_at,
        amount,
        currency: 'ILS',
        direction,
        description,
        reference,
        counterparty: null,
        external_sk: `scraper:${createHash('sha256').update(skBase).digest('hex').slice(0, 24)}`,
        source: 'scraper',
      })
    }
  }

  return { ok: true, rows, mode: 'worker' }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'bino-bank-scraper-worker' }))
    return
  }

  if (!authOk(req)) {
    unauthorized(res)
    return
  }

  try {
    if (req.method === 'POST' && url.pathname === '/otp') {
      const body = await readJson(req)
      const result = submitOtp(body.projectId || body.project_id, body.otp_code || body.code)
      res.writeHead(result.ok ? 200 : 400, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    if (req.method === 'POST' && url.pathname === '/scrape') {
      const body = await readJson(req)
      const projectId = body.projectId || body.project_id
      const provider = body.provider
      const credentials = body.credentials
      if (!projectId || !provider || !credentials || typeof credentials !== 'object') {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'חסר projectId / provider / credentials' }))
        return
      }
      try {
        const result = await runScrape({
          projectId,
          provider,
          credentials,
          startDate: body.startDate,
        })
        res.writeHead(result.ok ? 200 : 502, { 'content-type': 'application/json' })
        res.end(JSON.stringify(result))
      } finally {
        const w = waiters.get(projectId)
        if (w) {
          clearTimeout(w.timer)
          waiters.delete(projectId)
        }
        pending.delete(projectId)
      }
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: e instanceof Error ? e.message.slice(0, 300) : 'error' }))
  }
})

if (!SECRET) {
  console.error('[bank-scraper-worker] Missing BUILDING_BANK_SCRAPER_WORKER_SECRET')
  process.exit(1)
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[bank-scraper-worker] listening on :${PORT}`)
})
