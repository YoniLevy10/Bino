import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import {
  insertParkingVehicle,
  listParkingVehicles,
  normalizeParkingPlate,
} from '@/lib/palgate/parking-vehicles'
import {
  requirePalGatePilotSession,
  requirePalGatePilotWrite,
} from '@/lib/palgate/require-pilot'

const createBodySchema = z.object({
  plate: z.string().min(2).max(40),
  label: z.string().max(80).nullable().optional(),
})

export async function GET() {
  const auth = await requirePalGatePilotSession()
  if (!auth.ok) return auth.response

  try {
    const vehicles = await listParkingVehicles(auth.ctx.admin, auth.ctx.clientId)
    return NextResponse.json({ vehicles })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה בטעינת רכבים' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requirePalGatePilotWrite()
  if (!auth.ok) return auth.response

  const limited = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'parking-vehicles-create'
  )
  if (limited) return limited

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const parsed = createBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'מספר רכב לא תקין' }, { status: 400 })
  }

  try {
    const vehicle = await insertParkingVehicle(auth.ctx.admin, {
      clientId: auth.ctx.clientId,
      plate: parsed.data.plate,
      label: parsed.data.label ?? null,
      userId: auth.ctx.userId,
    })
    await logAudit({
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      action: 'parking_vehicle_create',
      entityType: 'parking_vehicle',
      entityId: vehicle.id,
      newValues: { plate: vehicle.plate, label: vehicle.label },
    })
    return NextResponse.json({ vehicle })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה בשמירה'
    const status = msg.includes('כבר קיים') ? 409 : 400
    return NextResponse.json({ error: msg, normalized: normalizeParkingPlate(parsed.data.plate) }, { status })
  }
}
