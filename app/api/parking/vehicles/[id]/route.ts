import { NextResponse } from 'next/server'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { deleteParkingVehicle } from '@/lib/palgate/parking-vehicles'
import { requirePalGatePilotWrite } from '@/lib/palgate/require-pilot'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requirePalGatePilotWrite()
  if (!auth.ok) return auth.response

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'parking-vehicles-delete'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  }

  try {
    await deleteParkingVehicle(auth.ctx.admin, {
      clientId: auth.ctx.clientId,
      vehicleId: id,
    })
    await logAudit({
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      action: 'parking_vehicle_delete',
      entityType: 'parking_vehicle',
      entityId: id,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה במחיקה'
    const status = msg.includes('לא נמצא') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
