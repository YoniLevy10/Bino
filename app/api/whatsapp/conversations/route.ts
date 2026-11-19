import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listWhatsAppConversations } from '@/lib/whatsapp/whatsapp-message-store'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/addons/paid-addons'
import { isWhatsAppInboxV2Enabled } from '@/lib/whatsapp/whatsapp-inbox-v2-flag'
import { whatsappConversationsQuerySchema } from '@/lib/whatsapp/whatsapp-api-schemas'
import { listWhatsAppConversationsV2 } from '@/lib/whatsapp/whatsapp-inbox-list-enrich'

export async function GET(req: NextRequest) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  try {
    const admin = getSupabaseAdmin()
    const v2 = isWhatsAppInboxV2Enabled()
    if (!v2) {
      const rows = await listWhatsAppConversations(admin, auth.ctx.clientId)
      return NextResponse.json({ conversations: rows, inbox_v2: false })
    }

    const filterParsed = whatsappConversationsQuerySchema.safeParse({
      building_id: req.nextUrl.searchParams.get('building_id') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      unread_only: req.nextUrl.searchParams.get('unread_only') ?? undefined,
    })

    const filters = filterParsed.success
      ? filterParsed.data
      : { building_id: undefined, status: 'all' as const, unread_only: false }

    let unreadBeforeByConversation: Record<string, string> | undefined
    if (filters.unread_only) {
      const raw = req.nextUrl.searchParams.get('read_map')
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, string>
          if (parsed && typeof parsed === 'object') unreadBeforeByConversation = parsed
        } catch {
          /* ignore malformed client map */
        }
      }
    }

    const rows = await listWhatsAppConversationsV2(
      admin,
      auth.ctx.clientId,
      {
        buildingId: filters.building_id,
        status: filters.status ?? 'all',
        unreadOnly: filters.unread_only,
        unreadBeforeByConversation,
      },
      80
    )

    const buildingOptions = [
      ...new Map(
        rows
          .filter((r) => r.project_id && r.building_name)
          .map((r) => [r.project_id, { id: r.project_id!, name: r.building_name! }])
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({
      conversations: rows,
      inbox_v2: true,
      building_options: buildingOptions,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאת שרת' },
      { status: 500 }
    )
  }
}
