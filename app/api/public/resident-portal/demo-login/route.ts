import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isResidentPortalDevUnlocked } from '@/lib/resident-portal/dev-unlock'
import { issueDemoResidentLoginSession } from '@/lib/resident-portal/demo-session'
import {
  RESIDENT_MEMBERSHIP_COOKIE,
  RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
} from '@/lib/resident-portal/types'

/** Status for the QA demo page (no secrets). */
export async function GET() {
  return NextResponse.json({
    unlocked: isResidentPortalDevUnlocked(),
  })
}

/**
 * Private-server QA: issue a magiclink session for a DEMO resident without SMS.
 * Hard-gated by RESIDENT_PORTAL_DEV_UNLOCK + non-production runtime.
 */
export async function POST() {
  if (!isResidentPortalDevUnlocked()) {
    return NextResponse.json({ error: 'כניסת QA אינה פעילה בשרת זה' }, { status: 403 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  const result = await issueDemoResidentLoginSession(admin)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const res = NextResponse.json({
    ok: true,
    email: result.email,
    token_hash: result.tokenHash,
    membershipId: result.membershipId,
    project_id: result.projectId,
    project_name: result.projectName,
    resident_name: result.residentName,
    phone: result.phone,
  })
  res.cookies.set(RESIDENT_MEMBERSHIP_COOKIE, result.membershipId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RESIDENT_MEMBERSHIP_COOKIE_MAX_AGE_SEC,
  })
  return res
}
