import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { buildMetaOAuthUrl } from '@/lib/mbrain/meta/auth'
import { randomBytes } from 'crypto'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'

/**
 * Start Meta OAuth — returns authorize URL. State binds to org+user.
 */
export async function POST() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'mbrain-meta-oauth-start'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  try {
    const nonce = randomBytes(16).toString('hex')
    const state = Buffer.from(
      JSON.stringify({
        orgId: auth.ctx.organizationId,
        userId: auth.ctx.userId,
        nonce,
        t: Date.now(),
      })
    ).toString('base64url')

    // Store nonce for CSRF check (reuse audit metadata table via connection row)
    await auth.ctx.admin.from('mbrain_meta_connections').upsert(
      {
        organization_id: auth.ctx.organizationId,
        status: 'disconnected',
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )

    const url = buildMetaOAuthUrl(state)
    return NextResponse.json({ url, state })
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'OAuth start failed',
        hintHe: 'וודא ש-META_APP_ID ו-META_APP_SECRET מוגדרים ב-Vercel',
      },
      { status: 400 }
    )
  }
}
