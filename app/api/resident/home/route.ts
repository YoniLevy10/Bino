import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { listPublishedAnnouncementsForMembership } from '@/lib/resident-portal/announcements'
import { listAmenitiesForMembership } from '@/lib/resident-portal/amenities'
import { listChargesForMembership } from '@/lib/resident-portal/charges'

export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response

  try {
    const [announcements, amenities, charges] = await Promise.all([
      listPublishedAnnouncementsForMembership(auth.ctx.admin, auth.ctx.membership),
      listAmenitiesForMembership(auth.ctx.admin, auth.ctx.membership),
      listChargesForMembership(auth.ctx.admin, auth.ctx.membership),
    ])

    const pinned = announcements.find((a) => a.is_pinned) || announcements[0] || null
    const nextCharge =
      charges.charges.find((c) => c.status === 'sent' || c.status === 'failed') || null

    const { data: project } = await auth.ctx.admin
      .from('projects')
      .select(
        'id, name, city, address, resident_portal_contact_phone, resident_portal_contact_email, resident_portal_private_ticket_policy'
      )
      .eq('id', auth.ctx.membership.project_id)
      .maybeSingle()

    return NextResponse.json({
      membership: {
        id: auth.ctx.membership.id,
        client_name: auth.ctx.membership.client_name,
        client_logo_url: auth.ctx.membership.client_logo_url,
        project_name: auth.ctx.membership.project_name,
        apartment_number: auth.ctx.membership.apartment_number,
        role: auth.ctx.membership.role,
      },
      project: project ?? null,
      openBalance: charges.openBalance,
      nextCharge,
      pinnedAnnouncement: pinned
        ? { id: pinned.id, title: pinned.title, body: pinned.body }
        : null,
      amenitiesToday: amenities.map((a) => ({
        id: a.id,
        name: a.name,
        today: a.today,
      })),
    })
  } catch (e) {
    console.error('[resident/home]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'טעינת בית נכשלה' },
      { status: 500 }
    )
  }
}
