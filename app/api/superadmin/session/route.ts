import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { isSuperadminIdentity } from '@/lib/superadmin-identity'

/**
 * GET /api/superadmin/session — status for the superadmin gate UI.
 * Does not grant access; only reports auth / allowlist / AAL so the client can enroll or challenge MFA.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({
        authenticated: false,
        allowed: false,
        aal: null,
        nextLevel: null,
        email: null,
        userId: null,
        code: 'SUPERADMIN_AUTH_REQUIRED',
      })
    }

    const allowed = isSuperadminIdentity(user)
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const verifiedTotp = (factorsData?.totp ?? []).filter((f) => f.status === 'verified')
    const verifiedWebauthn = (factorsData?.webauthn ?? []).filter((f) => f.status === 'verified')
    const hasVerifiedFactor = verifiedTotp.length + verifiedWebauthn.length > 0

    return NextResponse.json({
      authenticated: true,
      allowed,
      aal: aalData?.currentLevel ?? 'aal1',
      nextLevel: aalData?.nextLevel ?? null,
      email: user.email ?? null,
      userId: user.id,
      hasVerifiedFactor,
      code: !allowed
        ? 'SUPERADMIN_FORBIDDEN'
        : aalData?.currentLevel === 'aal2'
          ? 'SUPERADMIN_OK'
          : hasVerifiedFactor
            ? 'SUPERADMIN_MFA_CHALLENGE'
            : 'SUPERADMIN_MFA_ENROLL',
    })
  } catch {
    return NextResponse.json(
      { error: 'שגיאת תצורת שרת', code: 'SUPERADMIN_CONFIG' },
      { status: 500 },
    )
  }
}
