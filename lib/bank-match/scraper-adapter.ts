/**
 * Israeli Bank Scrapers adapter.
 *
 * Live pull is for local/private Node only (Chromium). Blocked on Vercel serverless.
 * Enable with BUILDING_BANK_SCRAPER_SYNC_ENABLED=true.
 */

import { createHash } from 'crypto'
import type { NormalizedBankTransaction } from '@/lib/bank-match/types'
import { isBuildingBankScraperSyncEnabled } from '@/lib/bank-match/flags'
import { isScraperProviderId } from '@/lib/bank-match/scraper-providers'
import { normalizeScraperCredentials } from '@/lib/bank-match/scraper-credentials-normalize'

export type ScraperPullRequest = {
  clientId: string
  projectId: string
  provider: string
  /** Never log. */
  credentials?: Record<string, string>
  /** Lookback start; default ~45 days. */
  startDate?: Date
  /**
   * For OTP banks (One Zero etc.): called when the bank asks for a code.
   * Local PoC wires this to waitForScraperOtp + UI submit.
   */
  otpCodeRetriever?: (phoneHint: string) => Promise<string>
}

export type ScraperPullResult =
  | { ok: true; rows: NormalizedBankTransaction[]; mode: 'stub' | 'live' }
  | {
      ok: false
      error: string
      code: 'DISABLED' | 'NOT_IMPLEMENTED' | 'LEGAL_GATE' | 'VERCEL_BLOCKED' | 'SCRAPE_FAILED'
    }

/** Chromium scrapers must not run inside Vercel Functions. */
export function isScraperRuntimeAllowed(): boolean {
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    // Allow only if explicitly forced for a dedicated long-running host (not default).
    return process.env.BUILDING_BANK_SCRAPER_ALLOW_VERCEL === 'true'
  }
  return true
}

export async function pullBuildingBankTransactions(
  req: ScraperPullRequest
): Promise<ScraperPullResult> {
    if (!isBuildingBankScraperSyncEnabled()) {
      return {
        ok: false,
        error:
          'משיכה חיה מהבנק בוטלה. השתמשו בייבוא קובץ (CSV / Excel / PDF).',
        code: 'DISABLED',
      }
    }

  // Remote worker path is handled by callers via scrapeViaWorker — this function is local-only.
  if (!isScraperRuntimeAllowed()) {
    return {
      ok: false,
      error:
        'לא ניתן להריץ israeli-bank-scrapers על Vercel. הגדירו BUILDING_BANK_SCRAPER_WORKER_URL ל־worker, או הריצו מקומית.',
      code: 'VERCEL_BLOCKED',
    }
  }

  if (!req.credentials || Object.keys(req.credentials).length === 0) {
    return {
      ok: false,
      error: 'חסרים פרטי התחברות לבנק',
      code: 'SCRAPE_FAILED',
    }
  }

  if (!isScraperProviderId(req.provider)) {
    return {
      ok: false,
      error: `בנק לא נתמך: ${req.provider}`,
      code: 'SCRAPE_FAILED',
    }
  }

  try {
    const { CompanyTypes, createScraper } = await import('israeli-bank-scrapers')
    const companyId = (CompanyTypes as Record<string, string>)[req.provider]
    if (!companyId) {
      return {
        ok: false,
        error: `CompanyTypes חסר עבור ${req.provider}`,
        code: 'SCRAPE_FAILED',
      }
    }

    const startDate =
      req.startDate || new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)

    const showBrowser = process.env.BUILDING_BANK_SCRAPER_SHOW_BROWSER === 'true'
    const scraperOptions: Record<string, unknown> = {
      companyId,
      startDate,
      combineInstallments: false,
      showBrowser,
      otpTimeoutMs: 120_000,
    }
    if (req.otpCodeRetriever) {
      scraperOptions.otpCodeRetriever = req.otpCodeRetriever
    }

    const scraper = createScraper(scraperOptions as never)

    // One Zero / Pepper expect otpCodeRetriever on credentials as well as options.
    const normalized = normalizeScraperCredentials(
      req.provider,
      req.credentials || {}
    )
    const credentials: Record<string, unknown> = { ...normalized }
    if (req.otpCodeRetriever) {
      credentials.otpCodeRetriever = req.otpCodeRetriever
    }

    const scrapeResult = await scraper.scrape(credentials as never)

    if (!scrapeResult.success) {
      const errType = String(
        (scrapeResult as { errorType?: string }).errorType || 'unknown'
      )
      const errMsg = String(
        (scrapeResult as { errorMessage?: string }).errorMessage || ''
      )
      const he =
        /international phone|\+ and a three digit/i.test(errMsg)
          ? 'מספר הטלפון ל־One Zero חייב בפורמט בינלאומי עם +, למשל +972541234567'
          : /Cloudflare|DOCTYPE|Attention Required|WAF|not valid JSON/i.test(
                `${errType} ${errMsg}`
              )
            ? 'One Zero חסום ע״י Cloudflare (נדרש mTLS של אפליקציית האנדרואיד). בינתיים: ייבוא CSV/Excel מהבנק.'
            : errType === 'TWO_FACTOR_RETRIEVER_MISSING'
              ? 'הבנק דרש OTP אבל לא הוגדר מאחזר קוד — רעננו ונסו שוב; הזינו OTP כשמופיע.'
              : errType === 'INVALID_PASSWORD' || errType === 'CHANGE_PASSWORD'
                ? 'פרטי התחברות שגויים או שנדרש שינוי סיסמה באתר הבנק.'
                : errType === 'TIMEOUT'
                  ? 'תם הזמן בהתחברות לבנק (OTP / דפדפן).'
                  : `משיכת בנק נכשלה: ${errType}${errMsg ? ` — ${errMsg}` : ''}`
      return {
        ok: false,
        error: he.slice(0, 400),
        code: 'SCRAPE_FAILED',
      }
    }

    const accounts =
      (
        scrapeResult as {
          accounts?: Array<{
            accountNumber?: string
            txns?: Array<{
              date?: string | Date
              processedDate?: string | Date
              chargedAmount?: number
              description?: string
              memo?: string
              identifier?: string | number
              type?: string
              status?: string
            }>
          }>
        }
      ).accounts || []

    const rows: NormalizedBankTransaction[] = []
    for (const account of accounts) {
      const accountNumber = String(account.accountNumber || 'unknown')
      for (const txn of account.txns || []) {
        const charged = Number(txn.chargedAmount)
        if (!Number.isFinite(charged) || charged === 0) continue
        const direction: 'credit' | 'debit' = charged > 0 ? 'credit' : 'debit'
        const amount = Math.abs(charged)
        const bookedRaw = txn.processedDate || txn.date
        let booked_at: string | null = null
        if (bookedRaw instanceof Date) {
          booked_at = bookedRaw.toISOString().slice(0, 10)
        } else if (typeof bookedRaw === 'string' && bookedRaw) {
          const d = new Date(bookedRaw)
          booked_at = Number.isNaN(d.getTime())
            ? bookedRaw.slice(0, 10)
            : d.toISOString().slice(0, 10)
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
        const external_sk = `scraper:${createHash('sha256').update(skBase).digest('hex').slice(0, 24)}`
        rows.push({
          project_id: req.projectId,
          booked_at,
          amount,
          currency: 'ILS',
          direction,
          description,
          reference,
          counterparty: null,
          external_sk,
          source: 'scraper',
        })
      }
    }

    return { ok: true, rows, mode: 'live' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת סקרייפר'
    // Never echo credentials in error paths
    return {
      ok: false,
      error: msg.slice(0, 300),
      code: 'SCRAPE_FAILED',
    }
  }
}

/** Dry-run fixture path for local tests — does not touch real banks. */
export function scraperFixtureRows(
  projectId: string
): NormalizedBankTransaction[] {
  return [
    {
      project_id: projectId,
      booked_at: '2026-11-01',
      amount: 400,
      currency: 'ILS',
      direction: 'credit',
      description: 'העברה דירה 12 BINO-TEST',
      reference: 'BINO-TEST',
      counterparty: null,
      external_sk: `scraper-fixture:${projectId}:1`,
      source: 'scraper',
    },
  ]
}
