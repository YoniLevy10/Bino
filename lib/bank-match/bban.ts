/** Build / parse Israeli BBAN for Financy PIS (bank-branch-account). */

export function buildIsraeliBban(params: {
  bankCode: string
  branchNumber: string
  accountNumber: string
}): string | null {
  const bank = params.bankCode.replace(/\D/g, '')
  const branch = params.branchNumber.replace(/\D/g, '')
  const account = params.accountNumber.replace(/\D/g, '')
  if (bank.length < 1 || bank.length > 2) return null
  if (branch.length < 1 || branch.length > 3) return null
  if (account.length < 3) return null
  return `${bank.padStart(2, '0')}-${branch.padStart(3, '0')}-${account}`
}

export function parseIsraeliBban(bban: string): {
  bankCode: string
  branchNumber: string
  accountNumber: string
} | null {
  const m = bban.trim().match(/^(\d{1,2})-(\d{1,3})-(\d{3,})$/)
  if (!m) return null
  return {
    bankCode: m[1].padStart(2, '0'),
    branchNumber: m[2].padStart(3, '0'),
    accountNumber: m[3],
  }
}
