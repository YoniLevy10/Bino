import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-route-handler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listActiveMembershipsForUser } from '@/lib/resident-portal/memberships'

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  try {
    const memberships = await listActiveMembershipsForUser(admin, user.id)
    return NextResponse.json({
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        resident_id: m.resident_id,
        unit_id: m.unit_id,
        client_id: m.client_id,
        project_id: m.project_id,
        resident_name: m.resident_name,
        apartment_number: m.apartment_number,
        project_name: m.project_name,
        project_city: m.project_city,
        client_name: m.client_name,
        client_logo_url: m.client_logo_url,
      })),
    })
  } catch (e) {
    console.error('[resident/memberships]', e)
    return NextResponse.json({ error: 'טעינת דירות נכשלה' }, { status: 500 })
  }
}
