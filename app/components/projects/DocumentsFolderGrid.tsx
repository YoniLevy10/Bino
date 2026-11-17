'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useTenantProjectsList } from '@/lib/hooks/use-projects-list'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { Button, EmptyState, LoadingSpinner, SearchInput, Select, theme } from '../ui'
import { ProjectDocumentsPanel } from './ProjectDocumentsPanel'

export type DocumentFolderCard = {
  id: string
  name: string
  project_id: string | null
  project_name: string | null
  project_code: string | null
  parent_id?: string | null
  depth?: number
  file_count: number
  child_folder_count?: number
  last_document_at: string | null
  created_at: string
  independent: boolean
  can_create_subfolder?: boolean
}

type BreadcrumbItem = {
  id: string
  name: string
  parent_id: string | null
  depth: number
}

type Totals = {
  folders: number
  files: number
  independent: number
  with_project: number
}

type FilterKey = 'all' | 'independent'

const LEGACY_PROJECT_ROOT_FOLDER_NAME = 'מסמכים כלליים'

function isLegacyProjectRootName(name: string): boolean {
  return name.trim() === LEGACY_PROJECT_ROOT_FOLDER_NAME
}

function folderPrimaryLabel(folder: DocumentFolderCard): string {
  if (folder.independent) return folder.name
  const atProjectRoot = (folder.depth ?? 0) === 0 && folder.project_name
  if (atProjectRoot) return folder.project_name!
  if (folder.project_name && isLegacyProjectRootName(folder.name)) return folder.project_name
  return folder.name
}

const FOLDER_HOVER_BG = '#F3EFE9'
const FOLDER_SELECTED_BG = '#EDE7DF'

function formatRelativeHe(iso: string | null): string {
  if (!iso) return 'אין קבצים'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `עודכן ${d.toLocaleDateString('he-IL')}`
}

function FolderCardButton({
  folder,
  selected,
  hovered,
  onHover,
  onLeave,
  onOpen,
  isMobile,
}: {
  folder: DocumentFolderCard
  selected: boolean
  hovered: boolean
  onHover: () => void
  onLeave: () => void
  onOpen: () => void
  isMobile: boolean
}) {
  const childCount = folder.child_folder_count ?? 0
  const displayName = folderPrimaryLabel(folder)
  const isProjectRoot = !folder.independent && (folder.depth ?? 0) === 0
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        ...styles.card,
        background: selected ? FOLDER_SELECTED_BG : hovered ? FOLDER_HOVER_BG : theme.colors.surface,
        borderColor: selected ? theme.colors.borderStrong : theme.colors.border,
        transform: hovered ? 'translateY(-1px)' : 'none',
        width: isMobile ? '100%' : undefined,
      }}
    >
      <span style={styles.cardName}>{displayName}</span>
      <span style={styles.cardMeta}>
        {folder.independent
          ? 'תיקיה עצמאית'
          : isProjectRoot
            ? [folder.project_code, childCount > 0 ? `${childCount} תתי־תיקיות` : null]
                .filter(Boolean)
                .join(' · ') || 'בניין'
            : childCount > 0
              ? `${childCount} תתי־תיקיות`
              : folder.project_code || 'בניין'}
      </span>
      <span style={styles.cardFooter}>
        {folder.file_count} קבצים · {formatRelativeHe(folder.last_document_at)}
      </span>
    </button>
  )
}

export function DocumentsFolderGrid() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const folderFromUrl = searchParams.get('folder')?.trim() ?? ''
  const projectFromUrl = searchParams.get('project')?.trim() ?? ''

  const [folders, setFolders] = useState<DocumentFolderCard[]>([])
  const [totals, setTotals] = useState<Totals>({ folders: 0, files: 0, independent: 0, with_project: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createAsSubfolder, setCreateAsSubfolder] = useState(false)
  const [newName, setNewName] = useState('')
  const [newProjectId, setNewProjectId] = useState(projectFromUrl)
  const [creating, setCreating] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const [detailFolder, setDetailFolder] = useState<DocumentFolderCard | null>(null)
  const [detailChildren, setDetailChildren] = useState<DocumentFolderCard[]>([])
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)

  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, createOpen)

  const { projects } = useTenantProjectsList({ activeOnly: true })

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (projectFromUrl) {
      setNewProjectId(projectFromUrl)
    }
  }, [projectFromUrl])

  const loadRoots = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/projects/document-folders')
      const json = (await res.json()) as {
        folders?: DocumentFolderCard[]
        totals?: Totals
        error?: string
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      setFolders(json.folders ?? [])
      setTotals(json.totals ?? { folders: 0, files: 0, independent: 0, with_project: 0 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת תיקיות נכשלה')
      setFolders([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFolderDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError(false)
    try {
      const res = await fetchWithTimeout(
        `/api/projects/document-folders?folder_id=${encodeURIComponent(id)}`
      )
      const json = (await res.json()) as {
        folder?: DocumentFolderCard
        children?: DocumentFolderCard[]
        breadcrumb?: BreadcrumbItem[]
        error?: string
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      if (!json.folder) throw new Error('תיקיה לא נמצאה')
      setDetailFolder(json.folder)
      setDetailChildren(json.children ?? [])
      setBreadcrumb(json.breadcrumb ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת תיקיה נכשלה')
      setDetailFolder(null)
      setDetailChildren([])
      setBreadcrumb([])
      setDetailError(true)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (folderFromUrl) {
      void loadFolderDetail(folderFromUrl)
    } else {
      setDetailFolder(null)
      setDetailChildren([])
      setBreadcrumb([])
      setDetailError(false)
      void loadRoots()
    }
  }, [folderFromUrl, loadFolderDetail, loadRoots])

  const showPills =
    folders.length > 0 && totals.independent > 0 && totals.with_project > 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return folders.filter((f) => {
      if (filter === 'independent' && !f.independent) return false
      if (!q) return true
      const label = folderPrimaryLabel(f)
      const hay = `${label} ${f.name} ${f.project_name ?? ''} ${f.project_code ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [folders, filter, search])

  const { projectFolders, independentFolders } = useMemo(() => {
    const independent = filtered.filter((f) => f.independent)
    const projects = filtered
      .filter((f) => !f.independent)
      .sort((a, b) =>
        folderPrimaryLabel(a).localeCompare(folderPrimaryLabel(b), 'he')
      )
    return { projectFolders: projects, independentFolders: independent }
  }, [filtered])

  function openFolder(id: string) {
    router.replace(`/project-documents?folder=${encodeURIComponent(id)}`, { scroll: false })
  }

  function closeFolder() {
    router.replace('/project-documents', { scroll: false })
  }

  function openCreateRoot() {
    setCreateAsSubfolder(false)
    setNewName('')
    setNewProjectId(projectFromUrl)
    setCreateOpen(true)
  }

  function openCreateSubfolder() {
    setCreateAsSubfolder(true)
    setNewName('')
    setCreateOpen(true)
  }

  async function onCreate() {
    const name = newName.trim()
    if (!name) {
      toast.error('נא להזין שם תיקיה')
      return
    }
    if (createAsSubfolder && !detailFolder) {
      toast.error('תיקיית האב לא זמינה')
      return
    }
    setCreating(true)
    try {
      const body = createAsSubfolder
        ? { name, parent_id: detailFolder!.id }
        : { name, project_id: newProjectId.trim() || null }

      const res = await fetchWithTimeout('/api/projects/document-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { folder?: DocumentFolderCard; error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success(createAsSubfolder ? 'התת־תיקיה נוצרה' : 'התיקיה נוצרה')
      setCreateOpen(false)
      setNewName('')
      setNewProjectId('')
      setCreateAsSubfolder(false)
      if (json.folder?.id) {
        openFolder(json.folder.id)
      } else if (folderFromUrl) {
        await loadFolderDetail(folderFromUrl)
      } else {
        await loadRoots()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'יצירה נכשלה')
    } finally {
      setCreating(false)
    }
  }

  if (folderFromUrl) {
    if (detailLoading && !detailFolder) {
      return (
        <div style={styles.loading}>
          <LoadingSpinner />
        </div>
      )
    }

    if (detailError || !detailFolder) {
      return (
        <EmptyState
          title="התיקיה לא נמצאה"
          description="ייתכן שנמחקה או שאין הרשאה."
          action={
            <Button variant="secondary" onClick={closeFolder}>
              חזרה לתיקיות
            </Button>
          }
        />
      )
    }

    const canCreateSub = detailFolder.can_create_subfolder !== false && (detailFolder.depth ?? 0) < 2
    const detailDisplayName = folderPrimaryLabel(detailFolder)
    const atProjectRoot = !detailFolder.independent && (detailFolder.depth ?? 0) === 0

    function crumbLabel(
      crumb: BreadcrumbItem,
      projectName: string | null | undefined,
      independent: boolean
    ) {
      if (!independent && projectName && (crumb.depth === 0 || isLegacyProjectRootName(crumb.name))) {
        return projectName
      }
      return crumb.name
    }

    return (
      <div style={styles.detailWrap}>
        <div style={styles.detailHeader}>
          <nav style={styles.breadcrumb} aria-label="ניווט תיקיות">
            <button type="button" onClick={closeFolder} style={styles.crumbBtn}>
              כל הבניינים
            </button>
            {breadcrumb.map((crumb, idx) => {
              const isLast = idx === breadcrumb.length - 1
              const label = crumbLabel(
                crumb,
                detailFolder.project_name,
                detailFolder.independent
              )
              return (
                <span key={crumb.id} style={styles.crumbItem}>
                  <span style={styles.crumbSep} aria-hidden>
                    /
                  </span>
                  {isLast ? (
                    <span style={styles.crumbCurrent}>{label}</span>
                  ) : (
                    <button type="button" onClick={() => openFolder(crumb.id)} style={styles.crumbBtn}>
                      {label}
                    </button>
                  )}
                </span>
              )
            })}
          </nav>
          <div style={styles.detailTitleRow}>
            <div style={styles.detailTitles}>
              <h2 style={styles.detailTitle}>{detailDisplayName}</h2>
              <p style={styles.detailSub}>
                {[
                  detailFolder.independent
                    ? 'תיקיה עצמאית'
                    : atProjectRoot
                      ? detailFolder.project_code
                      : detailFolder.project_name
                        ? `בניין: ${detailFolder.project_name}`
                        : null,
                  `${detailFolder.file_count} קבצים`,
                  (detailFolder.child_folder_count ?? 0) > 0
                    ? `${detailFolder.child_folder_count} תתי־תיקיות`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {canCreateSub ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={openCreateSubfolder}
                style={{ flexShrink: 0 }}
              >
                + תת־תיקיה חדשה
              </Button>
            ) : null}
          </div>
        </div>

        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <span style={styles.sectionLabel}>תתי־תיקיות</span>
            <div style={styles.sectionLine} />
            <span style={styles.sectionCount}>{detailChildren.length}</span>
          </div>
          {detailChildren.length === 0 ? (
            <p style={styles.emptySubfolders}>
              {canCreateSub
                ? 'אין תתי־תיקיות עדיין — צרו תת־תיקיה לארגון לפי קטגוריה.'
                : 'אין תתי־תיקיות ברמה זו.'}
            </p>
          ) : (
            <div
              style={{
                ...styles.grid,
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
              }}
            >
              {detailChildren.map((folder) => (
                <FolderCardButton
                  key={folder.id}
                  folder={folder}
                  selected={false}
                  hovered={hoveredId === folder.id}
                  onHover={() => setHoveredId(folder.id)}
                  onLeave={() => setHoveredId(null)}
                  onOpen={() => openFolder(folder.id)}
                  isMobile={isMobile}
                />
              ))}
            </div>
          )}
        </section>

        <ProjectDocumentsPanel
          projectId={detailFolder.project_id}
          folderId={detailFolder.id}
          folderName={detailDisplayName}
        />

        {createOpen && createAsSubfolder ? (
          <CreateFolderModal
            modalRef={modalRef}
            isMobile={isMobile}
            title="תת־תיקיה חדשה"
            newName={newName}
            setNewName={setNewName}
            creating={creating}
            onClose={() => {
              setCreateOpen(false)
              setCreateAsSubfolder(false)
            }}
            onCreate={() => void onCreate()}
            hint={`נוצרת בתוך «${detailDisplayName}».`}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={isMobile ? styles.toolbarMobile : styles.toolbar}>
        <div style={styles.titleBlock}>
          {isMobile ? <h1 style={styles.pageTitle}>מסמכים</h1> : null}
          <p style={styles.pageSub}>
            {totals.with_project} בניינים · {totals.files} קבצים
            {totals.independent > 0 ? ` · ${totals.independent} תיקיות עצמאיות` : ''}
          </p>
        </div>
        <div style={styles.actions}>
          <Button
            variant="primary"
            onClick={openCreateRoot}
            style={{ background: theme.colors.navy, borderColor: theme.colors.navy }}
          >
            + תיקיה חדשה
          </Button>
        </div>
      </div>

      {showPills && (
        <div style={styles.pills} role="tablist" aria-label="סינון תיקיות">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => setFilter('all')}
            style={filter === 'all' ? styles.pillActive : styles.pill}
          >
            הכל · {totals.folders}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'independent'}
            onClick={() => setFilter('independent')}
            style={filter === 'independent' ? styles.pillActive : styles.pill}
          >
            תיקיות עצמאיות · {totals.independent}
          </button>
        </div>
      )}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="חיפוש בניינים או תיקיות..."
        style={{ width: '100%', maxWidth: '100%' }}
      />

      {loading ? (
        <div style={styles.loading}>
          <LoadingSpinner />
        </div>
      ) : folders.length === 0 ? (
        <EmptyState
          title="אין תיקיות עדיין"
          description="צרו תיקיה עצמאית או תיקיה לבניין כדי להתחיל לארגן מסמכים."
          action={
            <Button variant="primary" onClick={openCreateRoot}>
              + תיקיה חדשה
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="לא נמצאו תיקיות" description="נסו לשנות חיפוש או סינון." />
      ) : (
        <div style={styles.sections}>
          {filter !== 'independent' && projectFolders.length > 0 ? (
            <section style={styles.section}>
              <div
                style={{
                  ...styles.grid,
                  gridTemplateColumns: isMobile
                    ? '1fr'
                    : 'repeat(auto-fill, minmax(220px, 1fr))',
                }}
              >
                {projectFolders.map((folder) => (
                  <FolderCardButton
                    key={folder.id}
                    folder={folder}
                    selected={folder.id === folderFromUrl}
                    hovered={hoveredId === folder.id}
                    onHover={() => setHoveredId(folder.id)}
                    onLeave={() => setHoveredId(null)}
                    onOpen={() => openFolder(folder.id)}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {filter !== 'independent' && independentFolders.length > 0 ? (
            <section style={styles.sectionMuted}>
              <div style={styles.sectionHead}>
                <span style={styles.sectionLabelMuted}>תיקיות עצמאיות</span>
                <div style={styles.sectionLine} />
                <span style={styles.sectionCount}>{independentFolders.length}</span>
              </div>
              <div
                style={{
                  ...styles.grid,
                  gridTemplateColumns: isMobile
                    ? '1fr'
                    : 'repeat(auto-fill, minmax(200px, 1fr))',
                }}
              >
                {independentFolders.map((folder) => (
                  <FolderCardButton
                    key={folder.id}
                    folder={folder}
                    selected={folder.id === folderFromUrl}
                    hovered={hoveredId === folder.id}
                    onHover={() => setHoveredId(folder.id)}
                    onLeave={() => setHoveredId(null)}
                    onOpen={() => openFolder(folder.id)}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {filter === 'independent' && independentFolders.length > 0 ? (
            <section style={styles.section}>
              <div
                style={{
                  ...styles.grid,
                  gridTemplateColumns: isMobile
                    ? '1fr'
                    : 'repeat(auto-fill, minmax(200px, 1fr))',
                }}
              >
                {independentFolders.map((folder) => (
                  <FolderCardButton
                    key={folder.id}
                    folder={folder}
                    selected={folder.id === folderFromUrl}
                    hovered={hoveredId === folder.id}
                    onHover={() => setHoveredId(folder.id)}
                    onLeave={() => setHoveredId(null)}
                    onOpen={() => openFolder(folder.id)}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {createOpen && !createAsSubfolder ? (
        <CreateFolderModal
          modalRef={modalRef}
          isMobile={isMobile}
          title="תיקיה חדשה"
          newName={newName}
          setNewName={setNewName}
          creating={creating}
          onClose={() => setCreateOpen(false)}
          onCreate={() => void onCreate()}
          hint="תיקיה עצמאית זמינה לכל החשבון. לבניין קיים — נכנסים דרך כרטיס הבניין בגריד."
          projectSelect={{
            value: newProjectId,
            onChange: setNewProjectId,
            options: [
              { label: 'עצמאית — בלי בניין', value: '' },
              ...projects.map((p) => ({ label: p.name, value: p.id })),
            ],
          }}
        />
      ) : null}
    </div>
  )
}

function CreateFolderModal({
  modalRef,
  isMobile,
  title,
  newName,
  setNewName,
  creating,
  onClose,
  onCreate,
  hint,
  projectSelect,
}: {
  modalRef: RefObject<HTMLDivElement | null>
  isMobile: boolean
  title: string
  newName: string
  setNewName: (v: string) => void
  creating: boolean
  onClose: () => void
  onCreate: () => void
  hint: string
  projectSelect?: {
    value: string
    onChange: (v: string) => void
    options: { label: string; value: string }[]
  }
}) {
  return (
    <div
      className={isMobile ? 'app-modal-backdrop-mobile' : undefined}
      style={styles.modalBackdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={isMobile ? 'app-modal-sheet-root' : undefined}
        style={isMobile ? styles.modalMobile : styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-folder-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="create-folder-title" style={styles.modalTitle}>
          {title}
        </h3>
        <div className={isMobile ? 'app-modal-sheet-scroll' : undefined}>
          <label style={styles.modalLabel} htmlFor="folder-name">
            שם התיקיה
          </label>
          <input
            id="folder-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={styles.modalInput}
            placeholder="למשל: חוזים 2026"
            autoFocus
          />
          {projectSelect ? (
            <>
              <label style={styles.modalLabel} htmlFor="folder-project">
                שיוך לבניין (אופציונלי)
              </label>
              <Select
                value={projectSelect.value}
                onChange={projectSelect.onChange}
                options={projectSelect.options}
              />
            </>
          ) : null}
          <p style={styles.hint}>{hint}</p>
        </div>
        <div className={isMobile ? 'app-modal-sheet-footer' : undefined} style={styles.modalActions}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            ביטול
          </Button>
          <Button size="sm" loading={creating} onClick={onCreate}>
            יצירה
          </Button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  toolbarMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  pageTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    letterSpacing: '-0.02em',
  },
  pageSub: {
    margin: '6px 0 0',
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  actions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  pills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    borderRadius: theme.radius.full,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  pillActive: {
    border: `1px solid ${theme.colors.navy}`,
    background: theme.colors.navy,
    color: theme.colors.textInverse,
    borderRadius: theme.radius.full,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: 48,
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionMuted: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
    paddingTop: 20,
    borderTop: `1px solid ${theme.colors.border}`,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    whiteSpace: 'nowrap',
  },
  sectionLabelMuted: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textMuted,
    whiteSpace: 'nowrap',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    background: theme.colors.border,
  },
  sectionCount: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: 500,
  },
  grid: {
    display: 'grid',
    gap: 12,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
    textAlign: 'right',
    padding: '16px 16px 14px',
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    transition: `background ${theme.motion.fast}, border-color ${theme.motion.fast}, transform ${theme.motion.fast}`,
    fontFamily: 'inherit',
    boxShadow: theme.shadows.xs,
  },
  cardName: {
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.3,
  },
  cardMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  cardFooter: {
    marginTop: 8,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  detailWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  detailHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  breadcrumb: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
  },
  crumbItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  crumbSep: {
    color: theme.colors.textMuted,
    marginInline: 2,
  },
  crumbBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.primary,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: 0,
    fontFamily: 'inherit',
  },
  crumbCurrent: {
    color: theme.colors.textPrimary,
    fontWeight: 600,
  },
  detailTitleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  detailTitles: { flex: 1, minWidth: 0 },
  detailTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  detailSub: {
    margin: '4px 0 0',
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  emptySubfolders: {
    margin: 0,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: theme.colors.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 20,
    maxWidth: 420,
    width: '100%',
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.md,
  },
  modalMobile: {
    background: theme.colors.surface,
    padding: '16px 20px 0',
    width: '100%',
    border: `1px solid ${theme.colors.border}`,
    zIndex: 1001,
  },
  modalTitle: {
    margin: '0 0 12px',
    fontSize: 16,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  modalLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    marginTop: 10,
    color: theme.colors.textSecondary,
  },
  modalInput: {
    width: '100%',
    marginBottom: 4,
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 15,
    boxSizing: 'border-box',
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontFamily: 'inherit',
  },
  hint: {
    margin: '10px 0 0',
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 1.4,
  },
  modalActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 16,
    paddingBottom: 4,
  },
}
