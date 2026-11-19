import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin/superadmin-auth'
import { createMetaWhatsappTemplateBodySchema } from '@/lib/api-body-schemas'
import {
  createMetaTemplateViaComposio,
  getComposioMetaTemplatesConfig,
  syncMetaTemplateSpecsViaComposio,
} from '@/lib/composio/composio-meta-templates'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

/**
 * GET — live Meta UTILITY template statuses via Composio (merged with local specs).
 * POST — submit a service template (ticket open/close etc.) to Meta via Composio.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const config = getComposioMetaTemplatesConfig()
  const accountOverride = req.nextUrl.searchParams.get('connected_account_id')?.trim() || null

  if (!config.configured && !accountOverride) {
    return NextResponse.json(
      {
        configured: false,
        error: config.messageHe,
        code: 'COMPOSIO_NOT_CONFIGURED',
        rows: [],
        templates: [],
      },
      { status: 503 }
    )
  }

  const sync = await syncMetaTemplateSpecsViaComposio({
    connectedAccountId: accountOverride || config.connectedAccountId,
  })

  if (!sync.ok) {
    const status = sync.error.code === 'COMPOSIO_NOT_CONFIGURED' ? 503 : 502
    return NextResponse.json(
      {
        configured: config.configured,
        error: sync.error.messageHe,
        detail: sync.error.message,
        code: sync.error.code,
        rows: [],
        templates: [],
      },
      { status }
    )
  }

  return NextResponse.json({
    configured: true,
    connected_account_id: accountOverride || config.connectedAccountId,
    rows: sync.rows,
    templates: sync.templates,
  })
}

export async function POST(req: NextRequest) {
  const logger = getLogger()
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const rawBody = await req.json().catch(() => null)
  const validated = createMetaWhatsappTemplateBodySchema.safeParse(rawBody)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
  }

  const body = validated.data
  const created = await createMetaTemplateViaComposio({
    specId: body.spec_id,
    nameSuffix: body.name_suffix,
    bodyOverride: body.body_override,
    connectedAccountId: body.connected_account_id,
    language: body.language,
  })

  if (!created.ok) {
    const err = created.error
    const status =
      err.code === 'COMPOSIO_NOT_CONFIGURED'
        ? 503
        : err.code === 'INVALID_SPEC' || err.code === 'NOT_COMPOSABLE'
          ? 400
          : 502
    logger.warn('META_TEMPLATES', 'create via Composio failed', {
      code: err.code,
      message: err.message,
      specId: body.spec_id,
    })
    return NextResponse.json(
      {
        error: err.messageHe,
        detail: err.message,
        code: err.code,
      },
      { status }
    )
  }

  return NextResponse.json({
    success: true,
    name: created.name,
    category: created.category,
    language: created.language,
    meta: created.metaResponse,
    note_he:
      'התבנית נשלחה ל-Meta. סטטוס ראשוני לרוב PENDING — אישור Meta יכול לקחת דקות עד ימים.',
  })
}
