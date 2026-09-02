import { NextResponse } from 'next/server'
import { requireMbrainSession, requireMbrainWriteRole } from '@/lib/mbrain/auth'
import { getOrgMetaAccessToken } from '@/lib/mbrain/meta/token'
import { listAdAccounts, listPages, listPixels } from '@/lib/mbrain/meta/accounts'
import { getMetaDataLabel, getMetaMode, getMetaGraphApiVersion } from '@/lib/mbrain/meta/client'
import { isEncryptionConfigured } from '@/lib/mbrain/crypto'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { writeMbrainAudit } from '@/lib/mbrain/audit'
import { z } from 'zod'

export async function GET() {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response

  const { data: connection } = await auth.ctx.admin
    .from('mbrain_meta_connections')
    .select('id, status, meta_user_id, token_expires_at, last_error, updated_at')
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()

  const { data: accounts } = await auth.ctx.admin
    .from('mbrain_meta_accounts')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('ad_account_name')

  const token = await getOrgMetaAccessToken(auth.ctx.admin, auth.ctx.organizationId)
  let liveAccounts = null
  let livePages = null
  if (token) {
    try {
      liveAccounts = await listAdAccounts(token)
      livePages = await listPages(token)
    } catch {
      liveAccounts = null
    }
  }

  return NextResponse.json({
    meta: {
      mode: getMetaMode(),
      label: getMetaDataLabel(),
      graphApiVersion: getMetaGraphApiVersion(),
      appIdConfigured: Boolean(process.env.META_APP_ID),
      encryptionConfigured: isEncryptionConfigured(),
    },
    connection: connection
      ? {
          status: connection.status,
          metaUserId: connection.meta_user_id,
          tokenExpiresAt: connection.token_expires_at,
          lastError: connection.last_error,
          updatedAt: connection.updated_at,
          hasToken: Boolean(token) || connection.status === 'mock',
        }
      : null,
    accounts: accounts ?? [],
    discovery: {
      accounts: liveAccounts?.accounts ?? null,
      pages: livePages?.pages ?? null,
    },
  })
}

const selectSchema = z.object({
  adAccountId: z.string().min(1),
  pageId: z.string().optional().nullable(),
  pageName: z.string().optional().nullable(),
  pixelId: z.string().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
})

export async function POST(req: Request) {
  const auth = await requireMbrainSession()
  if (!auth.ok) return auth.response
  const denied = requireMbrainWriteRole(auth.ctx)
  if (denied) return denied

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'mbrain-meta-select'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = selectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  await auth.ctx.admin
    .from('mbrain_meta_accounts')
    .update({ is_selected: false })
    .eq('organization_id', auth.ctx.organizationId)

  const { data: existing } = await auth.ctx.admin
    .from('mbrain_meta_accounts')
    .select('id')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('ad_account_id', parsed.data.adAccountId)
    .maybeSingle()

  let account
  if (existing) {
    const { data, error } = await auth.ctx.admin
      .from('mbrain_meta_accounts')
      .update({
        is_selected: true,
        page_id: parsed.data.pageId ?? null,
        page_name: parsed.data.pageName ?? null,
        pixel_id: parsed.data.pixelId ?? null,
        brand_id: parsed.data.brandId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    account = data
  } else {
    const token = await getOrgMetaAccessToken(auth.ctx.admin, auth.ctx.organizationId)
    const discovered = await listAdAccounts(token)
    const match = discovered.accounts.find((a) => a.id === parsed.data.adAccountId)
    const { data, error } = await auth.ctx.admin
      .from('mbrain_meta_accounts')
      .insert({
        organization_id: auth.ctx.organizationId,
        ad_account_id: parsed.data.adAccountId,
        ad_account_name: match?.name ?? parsed.data.adAccountId,
        currency: match?.currency ?? 'ILS',
        page_id: parsed.data.pageId ?? null,
        page_name: parsed.data.pageName ?? null,
        pixel_id: parsed.data.pixelId ?? null,
        brand_id: parsed.data.brandId ?? null,
        is_selected: true,
      })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    account = data
  }

  if (parsed.data.adAccountId && (await getOrgMetaAccessToken(auth.ctx.admin, auth.ctx.organizationId))) {
    try {
      const token = await getOrgMetaAccessToken(auth.ctx.admin, auth.ctx.organizationId)
      const pixels = await listPixels(token, parsed.data.adAccountId)
      if (pixels.pixels[0] && !parsed.data.pixelId) {
        await auth.ctx.admin
          .from('mbrain_meta_accounts')
          .update({ pixel_id: pixels.pixels[0].id })
          .eq('id', account.id)
      }
    } catch {
      /* optional */
    }
  }

  await writeMbrainAudit(auth.ctx.admin, {
    organizationId: auth.ctx.organizationId,
    actorUserId: auth.ctx.userId,
    action: 'meta.account.select',
    entityType: 'meta_account',
    entityId: account.id,
    after: account,
  })

  return NextResponse.json({ account })
}
