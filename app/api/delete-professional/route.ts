import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionMinRole } from '@/lib/api-auth'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'

const bodySchema = z.object({ professional_id: z.string().uuid() })

export async function POST(req: Request) {
  const requestId = `delete-professional-${Date.now()}`
  try {
    const auth = await requireSessionMinRole('admin')
    if (!auth.ok) return auth.response

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const addonCheck = await requireClientPaidAddon(supabase, clientId, PAID_ADDON_KEYS.professionals)
    if (!addonCheck.ok) return addonCheck.response

    const rl = await checkAuthenticatedPostRouteLimit(supabase, auth.ctx.userId, 'delete-professional')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות', requestId }, { status: 429 })
    }

    const { error } = await supabase
      .from('professionals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', parsed.data.professional_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)

    if (error) {
      return NextResponse.json({ error: 'שגיאת מחיקה', requestId }, { status: 500 })
    }

    return NextResponse.json({ success: true, requestId })
  } catch {
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
