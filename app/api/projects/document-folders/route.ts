import { NextResponse } from 'next/server'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { createDocumentFolderBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type FolderRow = {
  id: string
  name: string
  project_id: string | null
  parent_id: string | null
  depth: number
  created_at: string
  updated_at: string
}

type ProjectLite = {
  id: string
  name: string
  project_code: string | null
}

type BreadcrumbItem = {
  id: string
  name: string
  parent_id: string | null
  depth: number
}

const MAX_FOLDER_DEPTH = 2
/** Migration 144 backfill label — renamed on read to projects.name */
const LEGACY_PROJECT_ROOT_FOLDER_NAME = 'מסמכים כלליים'

function isLegacyProjectRootName(name: string): boolean {
  return name.trim() === LEGACY_PROJECT_ROOT_FOLDER_NAME
}

/**
 * Ensure every active building has a root document folder (parent_id null).
 * Migration 144 only backfilled buildings that already had project_documents;
 * without this, the documents grid hides empty projects.
 */
async function ensureProjectRootFolders(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
  userId: string | null
): Promise<void> {
  const [{ data: projects, error: projErr }, { data: existingRoots, error: rootsErr }] =
    await Promise.all([
      admin
        .from('projects')
        .select('id, name, is_active')
        .eq('client_id', clientId)
        .limit(500),
      admin
        .from('document_folders')
        .select('id, project_id, name')
        .eq('client_id', clientId)
        .is('parent_id', null)
        .not('project_id', 'is', null)
        .limit(500),
    ])

  if (projErr) throw new Error(projErr.message)
  if (rootsErr) throw new Error(rootsErr.message)

  const active = (
    (projects ?? []) as { id: string; name: string | null; is_active: boolean | null }[]
  ).filter((p) => p.is_active !== false)

  const nameByProjectId = new Map(
    active.map((p) => [p.id, (p.name ?? '').trim()] as const)
  )

  const roots = (existingRoots ?? []) as {
    id: string
    project_id: string | null
    name: string
  }[]

  // Rename legacy «מסמכים כלליים» roots so DB matches the project-as-folder UX.
  for (const row of roots) {
    if (!row.project_id || !isLegacyProjectRootName(row.name)) continue
    const desired = nameByProjectId.get(row.project_id) ?? ''
    if (desired.length === 0 || desired === row.name.trim()) continue
    const { error: updErr } = await admin
      .from('document_folders')
      .update({ name: desired, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('client_id', clientId)
    if (updErr && updErr.code !== '23505') {
      throw new Error(updErr.message)
    }
  }

  if (active.length === 0) return

  const covered = new Set(
    roots.map((r) => r.project_id).filter((id): id is string => Boolean(id))
  )

  const missing = active.filter((p) => !covered.has(p.id))
  if (missing.length === 0) return

  // Per-row inserts so one unique race does not abort the rest.
  for (const p of missing) {
    const trimmed = (p.name ?? '').trim()
    const folderName = trimmed.length > 0 ? trimmed : `בניין ${p.id.slice(0, 8)}`
    const { error: insErr } = await admin.from('document_folders').insert({
      client_id: clientId,
      project_id: p.id,
      parent_id: null,
      depth: 0,
      name: folderName,
      created_by: userId,
    })
    if (insErr && insErr.code !== '23505') {
      throw new Error(insErr.message)
    }
  }
}

/**
 * One root card per building — if multiple roots exist, keep the canonical one.
 */
function dedupeProjectRootFolders(
  rows: FolderRow[],
  projectNameById: Map<string, string>
): FolderRow[] {
  const independent = rows.filter((f) => f.project_id == null)
  const scoreRoot = (f: FolderRow): number => {
    const projName = (f.project_id ? projectNameById.get(f.project_id) : '') ?? ''
    const n = f.name.trim()
    if (projName && n.localeCompare(projName, 'he', { sensitivity: 'accent' }) === 0) return 3
    if (isLegacyProjectRootName(n)) return 2
    return 1
  }

  const bestByProject = new Map<string, FolderRow>()
  for (const f of rows) {
    if (!f.project_id) continue
    const cur = bestByProject.get(f.project_id)
    if (!cur) {
      bestByProject.set(f.project_id, f)
      continue
    }
    const sNew = scoreRoot(f)
    const sOld = scoreRoot(cur)
    if (sNew > sOld || (sNew === sOld && f.created_at < cur.created_at)) {
      bestByProject.set(f.project_id, f)
    }
  }

  const projectRoots = [...bestByProject.values()].sort((a, b) => {
    const na = a.project_id ? projectNameById.get(a.project_id) ?? a.name : a.name
    const nb = b.project_id ? projectNameById.get(b.project_id) ?? b.name : b.name
    return na.localeCompare(nb, 'he')
  })

  return [...projectRoots, ...independent]
}

async function enrichFolders(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
  rows: FolderRow[]
) {
  const folderIds = rows.map((f) => f.id)
  const projectIds = [...new Set(rows.map((f) => f.project_id).filter(Boolean))] as string[]

  const counts = new Map<string, number>()
  const latestByFolder = new Map<string, string>()
  const childCounts = new Map<string, number>()

  if (folderIds.length > 0) {
    const [{ data: docs, error: docsErr }, { data: children, error: childErr }] = await Promise.all([
      admin
        .from('project_documents')
        .select('folder_id, created_at')
        .eq('client_id', clientId)
        .in('folder_id', folderIds)
        .limit(5000),
      admin
        .from('document_folders')
        .select('parent_id')
        .eq('client_id', clientId)
        .in('parent_id', folderIds)
        .limit(2000),
    ])

    if (docsErr) throw new Error(docsErr.message)
    if (childErr) throw new Error(childErr.message)

    for (const d of docs ?? []) {
      const fid = (d as { folder_id: string | null }).folder_id
      if (!fid) continue
      counts.set(fid, (counts.get(fid) ?? 0) + 1)
      const created = (d as { created_at: string }).created_at
      const prev = latestByFolder.get(fid)
      if (!prev || created > prev) latestByFolder.set(fid, created)
    }

    for (const c of children ?? []) {
      const pid = (c as { parent_id: string | null }).parent_id
      if (!pid) continue
      childCounts.set(pid, (childCounts.get(pid) ?? 0) + 1)
    }
  }

  const projectNameById = new Map<string, ProjectLite>()
  if (projectIds.length > 0) {
    const { data: projects, error: projErr } = await admin
      .from('projects')
      .select('id, name, project_code')
      .eq('client_id', clientId)
      .in('id', projectIds)
      .limit(200)

    if (projErr) throw new Error(projErr.message)
    for (const p of (projects ?? []) as ProjectLite[]) {
      projectNameById.set(p.id, p)
    }
  }

  return rows.map((f) => {
    const project = f.project_id ? projectNameById.get(f.project_id) ?? null : null
    return {
      id: f.id,
      name: f.name,
      project_id: f.project_id,
      parent_id: f.parent_id,
      depth: f.depth,
      project_name: project?.name ?? null,
      project_code: project?.project_code ?? null,
      file_count: counts.get(f.id) ?? 0,
      child_folder_count: childCounts.get(f.id) ?? 0,
      last_document_at: latestByFolder.get(f.id) ?? null,
      created_at: f.created_at,
      updated_at: f.updated_at,
      independent: f.project_id == null,
      can_create_subfolder: f.depth < MAX_FOLDER_DEPTH,
    }
  })
}

async function loadBreadcrumb(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
  folder: FolderRow
): Promise<BreadcrumbItem[]> {
  const chain: BreadcrumbItem[] = [
    {
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id,
      depth: folder.depth,
    },
  ]

  let currentParentId = folder.parent_id
  // Max 3 levels — bound walk.
  for (let i = 0; i < MAX_FOLDER_DEPTH && currentParentId; i++) {
    const { data: parent, error } = await admin
      .from('document_folders')
      .select('id, name, parent_id, depth')
      .eq('id', currentParentId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (error || !parent) break
    const p = parent as BreadcrumbItem
    chain.unshift({
      id: p.id,
      name: p.name,
      parent_id: p.parent_id,
      depth: p.depth,
    })
    currentParentId = p.parent_id
  }

  return chain
}

/**
 * GET — list folders (roots by default, or children of parent_id).
 * Optional ?folder_id= returns that folder + breadcrumb + children.
 */
export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const clientId = auth.ctx.clientId
  const url = new URL(req.url)
  const folderId = url.searchParams.get('folder_id')?.trim() || null
  const parentIdParam = url.searchParams.get('parent_id')
  // parent_id omitted → roots; parent_id=<uuid> → children; parent_id= ignored if folder_id set
  const parentId =
    folderId != null
      ? null
      : parentIdParam === null || parentIdParam === ''
        ? null
        : parentIdParam.trim()

  try {
    if (folderId) {
      const { data: folder, error: folderErr } = await admin
        .from('document_folders')
        .select('id, name, project_id, parent_id, depth, created_at, updated_at')
        .eq('id', folderId)
        .eq('client_id', clientId)
        .maybeSingle()

      if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 })
      if (!folder) return NextResponse.json({ error: 'תיקיה לא נמצאה' }, { status: 404 })

      const current = folder as FolderRow
      const { data: childRows, error: childErr } = await admin
        .from('document_folders')
        .select('id, name, project_id, parent_id, depth, created_at, updated_at')
        .eq('client_id', clientId)
        .eq('parent_id', current.id)
        .order('created_at', { ascending: false })
        .limit(200)

      if (childErr) return NextResponse.json({ error: childErr.message }, { status: 500 })

      const [enrichedCurrent] = await enrichFolders(admin, clientId, [current])
      const children = await enrichFolders(admin, clientId, (childRows ?? []) as FolderRow[])
      const breadcrumb = await loadBreadcrumb(admin, clientId, current)

      return NextResponse.json({
        folder: enrichedCurrent,
        breadcrumb,
        children,
        folders: children,
      })
    }

    let query = admin
      .from('document_folders')
      .select('id, name, project_id, parent_id, depth, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(500)

    if (parentId) {
      // Validate parent belongs to tenant (bounded).
      const { data: parent } = await admin
        .from('document_folders')
        .select('id')
        .eq('id', parentId)
        .eq('client_id', clientId)
        .maybeSingle()
      if (!parent) return NextResponse.json({ error: 'תיקיה לא נמצאה' }, { status: 404 })
      query = query.eq('parent_id', parentId)
    } else {
      // Root list: materialize missing building folders so empty projects appear.
      await ensureProjectRootFolders(admin, clientId, auth.ctx.userId ?? null)
      query = query.is('parent_id', null)
    }

    const { data: folders, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (folders ?? []) as FolderRow[]

    const projectIds = [...new Set(rows.map((f) => f.project_id).filter(Boolean))] as string[]
    const projectNameById = new Map<string, string>()
    if (projectIds.length > 0) {
      const { data: projRows, error: projErr } = await admin
        .from('projects')
        .select('id, name')
        .eq('client_id', clientId)
        .in('id', projectIds)
        .limit(200)
      if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 })
      for (const p of (projRows ?? []) as { id: string; name: string }[]) {
        projectNameById.set(p.id, (p.name ?? '').trim())
      }
    }

    const deduped =
      parentId == null && !folderId
        ? dedupeProjectRootFolders(rows, projectNameById)
        : rows

    const result = await enrichFolders(admin, clientId, deduped)

    return NextResponse.json({
      folders: result,
      totals: {
        folders: result.length,
        files: result.reduce((sum, f) => sum + f.file_count, 0),
        independent: result.filter((f) => f.independent).length,
        with_project: result.filter((f) => !f.independent).length,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה בטעינת תיקיות' },
      { status: 500 }
    )
  }
}

/**
 * POST — create a root folder or subfolder (parent_id).
 */
export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents, { write: true })
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'document-folders-create')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createDocumentFolderBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const name = parsed.data.name.trim()
  let projectId = parsed.data.project_id ?? null
  const parentId = parsed.data.parent_id ?? null
  let depth = 0

  if (parentId) {
    const { data: parent } = await admin
      .from('document_folders')
      .select('id, project_id, depth, client_id')
      .eq('id', parentId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()

    if (!parent) {
      return NextResponse.json({ error: 'תיקיית האב לא נמצאה' }, { status: 404 })
    }

    const parentDepth = (parent as { depth: number }).depth
    if (parentDepth >= MAX_FOLDER_DEPTH) {
      return NextResponse.json(
        { error: 'לא ניתן ליצור תת־תיקיה נוספת (מקסימום 3 רמות)' },
        { status: 400 }
      )
    }

    projectId = (parent as { project_id: string | null }).project_id
    depth = parentDepth + 1
  } else if (projectId) {
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (!project) {
      return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
    }
  }

  const { data: inserted, error: insErr } = await admin
    .from('document_folders')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: projectId,
      parent_id: parentId,
      depth,
      name,
      created_by: auth.ctx.userId,
    })
    .select('id, name, project_id, parent_id, depth, created_at, updated_at')
    .single()

  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ error: 'כבר קיימת תיקיה בשם זה באותה רמה' }, { status: 409 })
    }
    if (insErr.message?.includes('max depth')) {
      return NextResponse.json(
        { error: 'לא ניתן ליצור תת־תיקיה נוספת (מקסימום 3 רמות)' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  try {
    const [folder] = await enrichFolders(admin, auth.ctx.clientId, [inserted as FolderRow])
    return NextResponse.json({ folder })
  } catch (e) {
    const row = inserted as FolderRow
    return NextResponse.json({
      folder: {
        id: row.id,
        name: row.name,
        project_id: row.project_id,
        parent_id: row.parent_id,
        depth: row.depth,
        project_name: null,
        project_code: null,
        file_count: 0,
        child_folder_count: 0,
        last_document_at: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        independent: row.project_id == null,
        can_create_subfolder: row.depth < MAX_FOLDER_DEPTH,
      },
      warning: e instanceof Error ? e.message : undefined,
    })
  }
}
