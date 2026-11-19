import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { createBuildingExpenseCategoryBodySchema } from '@/lib/api-body-schemas'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import {
  DEFAULT_BUILDING_EXPENSE_CATEGORIES,
  categoryKeyFromName,
} from '@/lib/building-finance/default-categories'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

function platformDisabled() {
  return NextResponse.json(
    { error: 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה', code: 'FINANCE_PLATFORM_DISABLED' },
    { status: 503 }
  )
}

type CategoryRow = {
  id: string
  key: string
  name_he: string
  project_id: string | null
  is_system: boolean
  sort_order: number
}

async function listCategories(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
  projectId: string | null
): Promise<{ data: CategoryRow[]; error: Error | null }> {
  let query = admin
    .from('building_expense_categories')
    .select('id, key, name_he, project_id, is_system, sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })
    .limit(100)

  if (projectId) {
    query = query.or(`project_id.is.null,project_id.eq.${projectId}`)
  } else {
    query = query.is('project_id', null)
  }

  const { data, error } = await query
  if (error) return { data: [], error: new Error(error.message) }
  return { data: (data ?? []) as CategoryRow[], error: null }
}

async function seedDefaultsIfEmpty(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string
): Promise<void> {
  const { count, error } = await admin
    .from('building_expense_categories')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .is('project_id', null)

  if (error || (count ?? 0) > 0) return

  const rows = DEFAULT_BUILDING_EXPENSE_CATEGORIES.map((c) => ({
    client_id: clientId,
    project_id: null,
    key: c.key,
    name_he: c.name_he,
    is_system: true,
    sort_order: c.sort_order,
  }))

  const { error: insErr } = await admin.from('building_expense_categories').insert(rows)
  if (insErr) {
    getLogger().warn('BUILDING_FINANCE', 'category seed failed', {
      clientId,
      err: insErr.message,
    })
  }
}

/** List expense categories (seeds system defaults once per client). */
export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() || null
  const admin = getSupabaseAdmin()

  await seedDefaultsIfEmpty(admin, auth.ctx.clientId)

  const { data, error } = await listCategories(admin, auth.ctx.clientId, projectId)
  if (error) {
    getLogger().error('BUILDING_FINANCE', 'categories list failed', error, {
      clientId: auth.ctx.clientId,
    })
    return NextResponse.json({ error: 'שגיאה בטעינת קטגוריות' }, { status: 500 })
  }

  return NextResponse.json({ categories: data })
}

/** Create a custom (non-system) expense category. */
export async function POST(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = createBuildingExpenseCategoryBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-finance-category'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  if (body.project_id) {
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (projectError) {
      return NextResponse.json({ error: 'שגיאה בטעינת פרויקט' }, { status: 500 })
    }
    if (!project) {
      return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
    }
  }

  const key = body.key?.trim() || categoryKeyFromName(body.name_he)
  const row = {
    client_id: auth.ctx.clientId,
    project_id: body.project_id ?? null,
    key,
    name_he: body.name_he.trim(),
    is_system: false,
    sort_order: body.sort_order ?? 200,
  }

  const { data, error } = await admin
    .from('building_expense_categories')
    .insert(row)
    .select('id, key, name_he, project_id, is_system, sort_order')
    .single()

  if (error) {
    const conflict = error.message.toLowerCase().includes('duplicate')
    getLogger().error(
      'BUILDING_FINANCE',
      'category create failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json(
      { error: conflict ? 'קטגוריה עם מפתח זה כבר קיימת' : 'שגיאה בשמירת קטגוריה' },
      { status: conflict ? 409 : 500 }
    )
  }

  return NextResponse.json({ category: data }, { status: 201 })
}
