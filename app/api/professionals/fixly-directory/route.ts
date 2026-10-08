import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { fixlyDirectoryConfig, listFixlyProfessionals } from '@/lib/fixly/pro-waitlist-directory.server'

/** Read-only slice of Fixly `pro_waitlist` professionals for the contact book. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'fixly-directory-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.professionals)
  if (!addonCheck.ok) return addonCheck.response

  if (!fixlyDirectoryConfig()) {
    return NextResponse.json({ configured: false, rows: [], hasMore: false })
  }

  try {
    const page = await listFixlyProfessionals(req.nextUrl.searchParams.get('q'))
    return NextResponse.json({ configured: true, ...page })
  } catch {
    return NextResponse.json({ error: 'טעינת מאגר Fixly נכשלה' }, { status: 502 })
  }
}
