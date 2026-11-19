import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAuthenticatedRateLimitSparse } from '@/lib/shared/rate-limit'
import { logAudit } from '@/lib/audit'
import { openPalGateDevice } from '@/lib/palgate/client'
import {
  getParkingVehicleByPlate,
  getParkingVehicleForClient,
} from '@/lib/palgate/parking-vehicles'
import { requirePalGatePilotWrite } from '@/lib/palgate/require-pilot'

const bodySchema = z.object({
  vehicle_id: z.string().uuid().optional(),
  plate: z.string().min(2).max(40).optional(),
})

function allowOpenWithoutVehicle(): boolean {
  return (process.env.PALGATE_ALLOW_OPEN_WITHOUT_VEHICLE || '').trim() === 'true'
}

export async function POST(req: Request) {
  const auth = await requirePalGatePilotWrite()
  if (!auth.ok) return auth.response

  // Gate opens are sensitive — tighter than generic POST (5/min).
  const rl = await checkAuthenticatedRateLimitSparse(
    auth.ctx.admin,
    `post:user:${auth.ctx.userId.slice(0, 64)}:parking-open-gate`,
    5,
    60_000,
    { failOpenOnRpcError: false, dbSyncEvery: 1 }
  )
  if (('rpcFailed' in rl && rl.rpcFailed) || rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let json: unknown = {}
  try {
    json = await req.json()
  } catch {
    json = {}
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  let plate: string | null = parsed.data.plate?.trim() || null
  let vehicleId: string | null = parsed.data.vehicle_id ?? null

  if (vehicleId) {
    try {
      const vehicle = await getParkingVehicleForClient(auth.ctx.admin, {
        clientId: auth.ctx.clientId,
        vehicleId,
      })
      if (!vehicle) {
        return NextResponse.json({ error: 'רכב לא נמצא' }, { status: 404 })
      }
      plate = vehicle.plate
      vehicleId = vehicle.id
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'שגיאה בטעינת רכב' },
        { status: 500 }
      )
    }
  } else if (plate) {
    try {
      const vehicle = await getParkingVehicleByPlate(auth.ctx.admin, {
        clientId: auth.ctx.clientId,
        plate,
      })
      if (!vehicle) {
        return NextResponse.json(
          { error: 'לוחית לא רשומה בחניון — רשמו רכב לפני פתיחת שער' },
          { status: 400 }
        )
      }
      plate = vehicle.plate
      vehicleId = vehicle.id
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'שגיאה בטעינת רכב' },
        { status: 500 }
      )
    }
  } else if (!allowOpenWithoutVehicle()) {
    return NextResponse.json(
      {
        error: 'נדרשת לוחית רשומה לפני פתיחת שער (או העבירו vehicle_id)',
        code: 'PALGATE_VEHICLE_REQUIRED',
      },
      { status: 400 }
    )
  }

  const result = await openPalGateDevice()

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: result.ok ? 'palgate_open_gate' : 'palgate_open_gate_failed',
    entityType: vehicleId ? 'parking_vehicle' : 'palgate_device',
    entityId: vehicleId,
    newValues: {
      plate,
      ok: result.ok,
      device_id: result.ok ? result.deviceId : null,
      output_num: result.ok ? result.outputNum : null,
      error: result.ok ? null : result.error,
    },
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: 'PALGATE_OPEN_FAILED' },
      { status: result.status && result.status >= 400 ? result.status : 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    plate,
    vehicle_id: vehicleId,
    device_id: result.deviceId,
    output_num: result.outputNum,
  })
}
