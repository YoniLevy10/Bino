import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { listPublishedAnnouncementsForMembership } from '@/lib/resident-portal/announcements'
import { listAmenitiesForMembership } from '@/lib/resident-portal/amenities'
import { listChargesForMembership } from '@/lib/resident-portal/charges'
import { loadPendingResidentApprovalsCount } from '@/lib/building-governance/pending-approvals'

export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response

  try {
    const membership = auth.ctx.membership
    const [announcements, amenities, charges, pendingApprovals] = await Promise.all([
      listPublishedAnnouncementsForMembership(auth.ctx.admin, membership),
      listAmenitiesForMembership(auth.ctx.admin, membership),
      listChargesForMembership(auth.ctx.admin, membership),
      loadPendingResidentApprovalsCount(auth.ctx.admin, {
        clientId: membership.client_id,
        projectId: membership.project_id,
        residentId: membership.resident_id,
      }),
    ])

    const pinned = announcements.find((a) => a.is_pinned) || announcements[0] || null
    const nextCharge =
      charges.charges.find((c) => c.status === 'sent' || c.status === 'failed') || null

    const { data: project } = await auth.ctx.admin
      .from('projects')
      .select(
        'id, name, city, address, resident_portal_contact_phone, resident_portal_contact_email, resident_portal_private_ticket_policy'
      )
      .eq('id', membership.project_id)
      .maybeSingle()

    return NextResponse.json({
      membership: {
        id: membership.id,
        client_name: membership.client_name,
        client_logo_url: membership.client_logo_url,
        project_name: membership.project_name,
        apartment_number: membership.apartment_number,
        role: membership.role,
      },
      project: project ?? null,
      openBalance: charges.openBalance,
      nextCharge,
      pendingApprovals,
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
