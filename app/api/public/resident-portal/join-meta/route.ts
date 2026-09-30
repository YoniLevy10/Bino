import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'

/**
 * Public branding for the resident join / OTP screen.
 * Only returns non-sensitive display fields when the portal is enabled.
 */
export async function GET(req: Request) {
  const projectId = sanitizeId(new URL(req.url).searchParams.get('project_id'))
  if (!projectId) {
    return NextResponse.json({ error: 'חסר מזהה פרויקט' }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'שגיאת תצורת שרת' }, { status: 500 })
  }

  const { data: project, error } = await admin
    .from('projects')
    .select(
      'id, name, city, resident_portal_enabled, clients ( id, name, display_name, logo_url )'
    )
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }
  if (!project.resident_portal_enabled) {
    return NextResponse.json({ error: 'פורטל הדיירים אינו פעיל בבניין זה' }, { status: 403 })
  }

  const client = Array.isArray(project.clients) ? project.clients[0] : project.clients
  const clientRow = client as {
    name?: string | null
    display_name?: string | null
    logo_url?: string | null
  } | null

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      city: project.city,
    },
    client: {
      name: clientRow?.display_name?.trim() || clientRow?.name?.trim() || 'BINO',
      logo_url: clientRow?.logo_url || null,
    },
  })
}
