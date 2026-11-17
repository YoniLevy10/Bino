import type { SupabaseClient } from '@supabase/supabase-js'
import type { FinancyCredentials } from '@/lib/bank/financy-auth'
import {
  extractAccountCurrency,
  extractAccountDisplayName,
  extractAccountType,
  extractBalanceAmount,
  extractTxAmount,
  isFinancyAccountDeleted,
  listAccounts,
  listTransactions,
} from '@/lib/bank/financy-gateway'

export type SyncBankResult = {
  accountsUpserted: number
  transactionsUpserted: number
  errors: string[]
}

function isoDateDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Bounded AIS sync into bank_accounts / bank_transactions.
 * Caps pages to avoid production-slowing sweeps.
 */
export async function syncFinancyAccountsAndTransactions(params: {
  admin: SupabaseClient
  clientId: string
  projectId?: string | null
  creds: FinancyCredentials
  dateFrom?: string
  dateTo?: string
  maxAccountPages?: number
  maxTxPages?: number
  txPageLimit?: number
}): Promise<SyncBankResult> {
  const {
    admin,
    clientId,
    projectId = null,
    creds,
    dateFrom = isoDateDaysAgo(90),
    dateTo = todayIso(),
    maxAccountPages = 5,
    maxTxPages = 10,
    txPageLimit = 50,
  } = params

  const errors: string[] = []
  let accountsUpserted = 0
  let transactionsUpserted = 0

  const accountIdByExternal = new Map<string, string>()
  let nextPage: string | undefined
  for (let page = 0; page < maxAccountPages; page++) {
    const listed = await listAccounts(creds, {
      limit: 50,
      nextPage,
    })
    if (!listed.ok) {
      errors.push(listed.error)
      break
    }
    for (const acc of listed.data.items) {
      const externalId = String(acc.id)

      // Drop soft-deleted Financy products so the bank screen stays accurate.
      if (isFinancyAccountDeleted(acc)) {
        await admin
          .from('bank_accounts')
          .delete()
          .eq('client_id', clientId)
          .eq('external_account_id', externalId)
        continue
      }

      const balance = extractBalanceAmount(acc)
      const currency = extractAccountCurrency(acc)
      const displayName = extractAccountDisplayName(acc)
      const accountType = extractAccountType(acc)

      const { data: upserted, error } = await admin
        .from('bank_accounts')
        .upsert(
          {
            client_id: clientId,
            project_id: projectId ?? null,
            provider: 'financy',
            external_account_id: externalId,
            connection_id: acc.connectionId ? String(acc.connectionId) : null,
            account_type: accountType,
            display_name: displayName,
            currency,
            balance,
            raw: acc as unknown as Record<string, unknown>,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,external_account_id' }
        )
        .select('id, external_account_id')
        .maybeSingle()

      if (error) {
        errors.push(error.message)
        continue
      }
      if (upserted?.id) {
        accountIdByExternal.set(String(upserted.external_account_id), upserted.id)
        accountsUpserted += 1
      } else {
        const { data: existing } = await admin
          .from('bank_accounts')
          .select('id, external_account_id')
          .eq('client_id', clientId)
          .eq('external_account_id', externalId)
          .maybeSingle()
        if (existing?.id) {
          accountIdByExternal.set(String(existing.external_account_id), existing.id)
          accountsUpserted += 1
        }
      }
    }
    nextPage = listed.data.nextPage
    if (!nextPage) break
  }

  let txNext: string | undefined
  for (let page = 0; page < maxTxPages; page++) {
    const listed = await listTransactions(creds, {
      dateFrom,
      dateTo,
      limit: txPageLimit,
      sort: -1,
      nextPage: txNext,
    })
    if (!listed.ok) {
      errors.push(listed.error)
      break
    }
    for (const tx of listed.data.items) {
      const sk = String(tx.SK || tx.id)
      const externalId = String(tx.id || sk)
      const amount = extractTxAmount(tx)
      const currency =
        tx.amount?.chargedAmount?.currency ||
        tx.amount?.originalAmount?.currency ||
        'ILS'
      const booked =
        tx.date?.bookingDate ||
        tx.date?.valueDate ||
        tx.date?.transactionDate ||
        null
      const description =
        tx.description?.description ||
        (tx.description as { fixedText?: string } | undefined)?.fixedText ||
        tx.merchantName ||
        null
      const category = tx.changedCategory || tx.category
      const merchantName =
        tx.merchantName ||
        (typeof (tx as { creditorName?: string }).creditorName === 'string'
          ? (tx as { creditorName?: string }).creditorName
          : null) ||
        (typeof (tx as { debtorName?: string }).debtorName === 'string'
          ? (tx as { debtorName?: string }).debtorName
          : null) ||
        null
      const bankAccountId = tx.accountId
        ? accountIdByExternal.get(String(tx.accountId)) || null
        : null

      const { error } = await admin.from('bank_transactions').upsert(
        {
          client_id: clientId,
          project_id: projectId ?? null,
          bank_account_id: bankAccountId,
          external_id: externalId,
          external_sk: sk,
          amount,
          currency,
          booked_at: booked,
          description,
          merchant_name: merchantName,
          category_main: category?.main || null,
          category_sub: category?.sub || null,
          raw: tx as unknown as Record<string, unknown>,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,external_sk' }
      )
      if (error) {
        errors.push(error.message)
        continue
      }
      transactionsUpserted += 1
    }
    txNext = listed.data.nextPage
    if (!txNext) break
  }

  return { accountsUpserted, transactionsUpserted, errors }
}
