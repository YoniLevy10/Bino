import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

/** NFC sticker install progress for tenant manager. */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const { data, error } = await admin
    .from('worker_nfc_tags')
    .select('id, tag_code, label, tag_type, sticker_installed_at, is_active')
    .eq('client_id', auth.ctx.clientId)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  const tags = data ?? []
  const installed = tags.filter((t) => (t as { sticker_installed_at?: string | null }).sticker_installed_at).length

  return NextResponse.json({
    total: tags.length,
    installed,
    tags,
  })
}
