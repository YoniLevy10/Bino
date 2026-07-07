import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { bulkImportResidentsFromParsed } from '@/lib/bulk-import-residents'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'

const bodySchema = z.object({
  client_id: z.string().uuid(),
  residents: z.array(
    z.object({
      project_name: z.string().min(1),
      apartment_number: z.string(),
      full_name: z.string().min(1),
      phone: z.string(),
      email: z.string(),
      is_renter: z.boolean(),
      notes: z.string(),
    })
  ),
  dry_run: z.boolean().optional(),
  purge_placeholders: z.boolean().optional(),
  create_missing_projects: z.boolean().optional(),
})

export async function POST(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await bulkImportResidentsFromParsed(getSupabaseAdmin(), {
      clientId: parsed.data.client_id,
      residents: parsed.data.residents,
      dryRun: parsed.data.dry_run,
      purgePlaceholders: parsed.data.purge_placeholders,
      createMissingProjects: parsed.data.create_missing_projects,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Import failed' },
      { status: 500 }
    )
  }
}
