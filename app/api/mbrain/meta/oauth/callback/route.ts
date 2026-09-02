import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchMetaMe,
} from '@/lib/mbrain/meta/auth'
import { encryptSecret } from '@/lib/mbrain/crypto'
import { listAdAccounts, listPages } from '@/lib/mbrain/meta/accounts'
import { mbrainLog } from '@/lib/mbrain/logging'
import { writeMbrainAudit } from '@/lib/mbrain/audit'

/**
 * Meta OAuth callback — exchanges code, stores encrypted token, syncs accounts.
 */
export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const fail = (msg: string) =>
    NextResponse.redirect(
      `${appUrl}/brain/settings/integrations?error=${encodeURIComponent(msg)}`
    )

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error')

  if (oauthError) return fail(oauthError)
  if (!code || !stateRaw) return fail('חסר code/state מ-Meta')

  let state: { orgId: string; userId: string; t: number }
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')) as typeof state
  } catch {
    return fail('state לא תקין')
  }

  if (Date.now() - state.t > 15 * 60 * 1000) return fail('פג תוקף בקשת החיבור')

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return fail('שגיאת תצורת שרת')
  }

  try {
    const short = await exchangeCodeForToken(code)
    let accessToken = short.accessToken
    let expiresIn = short.expiresIn
    try {
      const long = await exchangeForLongLivedToken(short.accessToken)
      accessToken = long.accessToken
      expiresIn = long.expiresIn ?? expiresIn
    } catch (e) {
      mbrainLog('warn', 'long_lived_token_fallback', {
        message: e instanceof Error ? e.message : String(e),
      })
    }

    const me = await fetchMetaMe(accessToken)
    const encrypted = encryptSecret(accessToken)
    const expiresAt =
      expiresIn != null ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

    await admin.from('mbrain_meta_connections').upsert(
      {
        organization_id: state.orgId,
        status: 'connected',
        meta_user_id: me.id,
        access_token_encrypted: encrypted,
        token_expires_at: expiresAt,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )

    const [{ accounts }, { pages }] = await Promise.all([
      listAdAccounts(accessToken),
      listPages(accessToken),
    ])

    for (const acc of accounts) {
      await admin.from('mbrain_meta_accounts').upsert(
        {
          organization_id: state.orgId,
          ad_account_id: acc.id,
          ad_account_name: acc.name,
          currency: acc.currency,
          is_selected: false,
          updated_at: new Date().toISOString(),
          raw: acc,
        },
        { onConflict: 'organization_id,ad_account_id' }
      )
    }

    // Attach first page to accounts lacking page_id
    const firstPage = pages[0]
    if (firstPage) {
      await admin
        .from('mbrain_meta_accounts')
        .update({ page_id: firstPage.id, page_name: firstPage.name })
        .eq('organization_id', state.orgId)
        .is('page_id', null)
    }

    await writeMbrainAudit(admin, {
      organizationId: state.orgId,
      actorUserId: state.userId,
      action: 'meta.oauth.connected',
      entityType: 'meta_connection',
      after: { metaUserId: me.id, accountCount: accounts.length, pageCount: pages.length },
    })

    return NextResponse.redirect(
      `${appUrl}/brain/settings/integrations?connected=1&accounts=${accounts.length}`
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OAuth failed'
    mbrainLog('error', 'meta_oauth_callback_failed', { message })
    try {
      await admin.from('mbrain_meta_connections').upsert(
        {
          organization_id: state.orgId,
          status: 'error',
          last_error: message,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' }
      )
    } catch {
      /* ignore */
    }
    return fail(message)
  }
}
