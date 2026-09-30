import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { listPublishedAnnouncementsForMembership } from '@/lib/resident-portal/announcements'

export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response
  try {
    const announcements = await listPublishedAnnouncementsForMembership(
      auth.ctx.admin,
      auth.ctx.membership
    )
    return NextResponse.json({ announcements })
  } catch (e) {
    console.error('[resident/announcements]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'טעינת הודעות נכשלה' },
      { status: 500 }
    )
  }
}
