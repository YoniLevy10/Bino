import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { listChargesForMembership } from '@/lib/resident-portal/charges'

export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const year = url.searchParams.get('year')
  const month = url.searchParams.get('month')

  try {
    const result = await listChargesForMembership(auth.ctx.admin, auth.ctx.membership, {
      year: year ? Number(year) : null,
      month: month ? Number(month) : null,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[resident/charges]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'טעינת חיובים נכשלה' },
      { status: 500 }
    )
  }
}
