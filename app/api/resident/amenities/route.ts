import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { listAmenitiesForMembership } from '@/lib/resident-portal/amenities'

export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response
  try {
    const amenities = await listAmenitiesForMembership(auth.ctx.admin, auth.ctx.membership)
    return NextResponse.json({ amenities })
  } catch (e) {
    console.error('[resident/amenities]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'טעינת מתקנים נכשלה' },
      { status: 500 }
    )
  }
}
