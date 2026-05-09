'use client'

/**
 * דף פרויקטים (בניינים) – ניהול כל הפרויקטים תחת הלקוח.
 *
 * מציג: ספירת פרויקטים פעילים/כלל, קארדים לכל פרויקט עם קוד QR ייחודי.
 *
 * פעולות:
 *  - "פרויקט חדש" → Drawer עם טופס יצירה → POST /api/create-project
 *  - עריכת פרויקט → PATCH /api/update-project (שם, כתובת, קוד)
 *  - ארכיב/הסרה → PATCH is_active=false
 *  - "קוד QR" → מנווט ל-/qr
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { validateRequired } from '@/lib/validators'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  StatusBadge,
  SearchInput,
  Select,
  Drawer,
  EmptyState,
  LoadingSpinner,
  theme
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageKpiSkeletonN, PageListSkeleton } from '../components/page-skeleton'

type ProjectRow = {
  id: string
  name: string
  project_code: string
  address: string | null
  qr_identifier: string | null
  is_active: boolean
  created_at: string
  client_id: string
  assigned_worker_id?: string | null
}

type WorkerRow = { id: string; full_name: string }

type ProjectForm = {
  name: string
  project_code: string
  address: string
  qr_identifier: string
  is_active: boolean
  assigned_worker_id: string
}

type TicketRow = {
  id: string
  ticket_number: number
  status: string
  priority?: string | null
}

const emptyForm: ProjectForm = {
  name: '',
  project_code: '',
  address: '',
  qr_identifier: '',
  is_active: true,
  assigned_worker_id: '',
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null)
  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectRow | null>(null)
  const [projectTickets, setProjectTickets] = useState<TicketRow[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)

  async function loadClientId() {
    const id = await resolveBamakorClientIdForBrowser()
    setClientId(id)
    return id
  }

  async function loadProjects(nextClientId?: string) {
    const activeClientId = nextClientId || clientId
    if (!activeClientId) return
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('client_id', activeClientId)
      .order('created_at', { ascending: false })

    if (error) throw error
    setProjects((data as ProjectRow[]) || [])
  }

  async function loadWorkers(nextClientId?: string) {
    const activeClientId = nextClientId || clientId
    if (!activeClientId) return
    const { data, error } = await supabase
      .from('workers')
      .select('id, full_name')
      .eq('client_id', activeClientId)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })

    if (error) throw error
    setWorkers((data as WorkerRow[]) || [])
  }

  async function updateProjectAssignedWorker(projectId: string, workerId: string) {
    await asyncHandler(
      async () => {
        const { error } = await withClientId(
          supabase.from('projects').update({ assigned_worker_id: workerId || null }),
          clientId
        ).eq('id', projectId)
        if (error) throw error
        toast.success(TM.projectMaintainerUpdated)
        await loadProjects()
        return true
      },
      { context: 'Failed to update assigned worker', showErrorToast: true }
    )
  }

  useEffect(() => {
    const initialize = async () => {
      setLoading(true)
      await asyncHandler(
        async () => {
          const fetchedClientId = await loadClientId()
          const [workersResult, projectsResult] = await Promise.all([
            supabase
              .from('workers')
              .select('id, full_name')
              .eq('client_id', fetchedClientId)
              .is('deleted_at', null)
              .order('full_name', { ascending: true }),
            supabase
              .from('projects')
              .select('*')
              .eq('client_id', fetchedClientId)
              .order('created_at', { ascending: false }),
          ])
          if (workersResult.error) throw workersResult.error
          if (projectsResult.error) throw projectsResult.error
          setWorkers((workersResult.data as WorkerRow[]) || [])
          setProjects((projectsResult.data as ProjectRow[]) || [])
          return true
        },
        { context: 'טעינת פרויקטים', showErrorToast: true }
      )
      setLoading(false)
    }
    void initialize()
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function openCreateDrawer() {
    setEditingProject(null)
    setForm(emptyForm)
    setDrawerOpen(true)
  }

  function openEditDrawer(project: ProjectRow) {
    setEditingProject(project)
    setForm({
      name: project.name || '',
      project_code: project.project_code || '',
      address: project.address || '',
      qr_identifier: project.qr_identifier || '',
      is_active: project.is_active,
      assigned_worker_id: project.assigned_worker_id || '',
    })
    setDrawerOpen(true)
  }

  function closeDrawer() {
    if (saving) return
    setDrawerOpen(false)
    setEditingProject(null)
    setForm(emptyForm)
  }

  async function openDetailDrawer(project: ProjectRow) {
    setSelectedProject(project)
    setDetailDrawerOpen(true)
    await fetchProjectTickets(project.id)
  }

  function closeDetailDrawer() {
    setDetailDrawerOpen(false)
    setSelectedProject(null)
    setProjectTickets([])
  }

  async function fetchProjectTickets(projectId: string) {
    setLoadingTickets(true)
    await asyncHandler(
      async () => {
        const scoped = clientId || (await resolveBamakorClientIdForBrowser())
        const { data, error } = await withClientId(
          supabase.from('tickets').select('id, ticket_number, status, priority'),
          scoped
        )
          .eq('project_id', projectId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })

        if (error) throw error
        setProjectTickets((data as TicketRow[]) || [])
        return true
      },
      { context: 'Failed to load project tickets', showErrorToast: false }
    )
    setLoadingTickets(false)
  }

  function updateForm<K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validateForm() {
    const nameError = validateRequired(form.name, 'Project name')
    if (nameError) return nameError.message
    const codeError = validateRequired(form.project_code, 'Project code')
    if (codeError) return codeError.message
    if (!clientId) return 'Client ID not found'
    return ''
  }

  async function saveProject() {
    const validationError = validateForm()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    await asyncHandler(
      async () => {
        const payload = {
          name: form.name.trim(),
          project_code: form.project_code.trim().toUpperCase(),
          address: form.address.trim() || null,
          qr_identifier: form.qr_identifier.trim() || null,
          is_active: form.is_active,
          client_id: editingProject?.client_id || clientId,
          assigned_worker_id: form.assigned_worker_id.trim() || null,
        }

        if (editingProject) {
          const { error } = await withClientId(supabase.from('projects').update(payload), clientId).eq(
            'id',
            editingProject.id
          )
          if (error) throw error
          toast.success(TM.projectUpdated)
        } else {
          const res = await fetchWithTimeout('/api/create-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: payload.name,
              project_code: payload.project_code,
              address: payload.address,
              qr_identifier: payload.qr_identifier,
              is_active: payload.is_active,
              assigned_worker_id: payload.assigned_worker_id,
            }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((json as { error?: string }).error || 'יצירת פרויקט נכשלה')
          toast.success(TM.projectCreated)
        }

        await loadProjects()
        closeDrawer()
        return true
      },
      { context: 'שמירת פרויקט נכשלה', showErrorToast: true }
    )
    setSaving(false)
  }

  async function toggleProjectStatus(project: ProjectRow) {
    await asyncHandler(
      async () => {
        const { error } = await withClientId(
          supabase.from('projects').update({ is_active: !project.is_active }),
          clientId
        ).eq('id', project.id)

        if (error) throw error
        toast.success(project.is_active ? TM.projectDeactivated : TM.projectActivated)
        await loadProjects()
        return true
      },
      { context: 'Failed to update project status', showErrorToast: true }
    )
  }

  async function deleteProject(project: ProjectRow) {
    const confirmed = window.confirm(
      `למחוק לצמיתות את "${project.name}"?\n\nיימחקו גם נתונים משויכים לפרויקט. פעולה בלתי הפיכה.`
    )
    if (!confirmed) return

    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/delete-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: project.id }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(json.error || 'מחיקת פרויקט נכשלה')
        toast.success(TM.projectDeleted)
        closeDetailDrawer()
        if (editingProject?.id === project.id) closeDrawer()
        await loadProjects()
        return true
      },
      { context: 'מחיקת פרויקט נכשלה', showErrorToast: true }
    )
  }

  const stats = useMemo(() => {
    const total = projects.length
    const active = projects.filter((p) => p.is_active).length
    const inactive = projects.filter((p) => !p.is_active).length
    return { total, active, inactive }
  }, [projects])

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const q = searchTerm.trim().toLowerCase()
      const matchesSearch = !q ||
        project.name.toLowerCase().includes(q) ||
        project.project_code.toLowerCase().includes(q) ||
        (project.address || '').toLowerCase().includes(q)

      const matchesStatus = statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && project.is_active) ||
        (statusFilter === 'INACTIVE' && !project.is_active)

      return matchesSearch && matchesStatus
    })
  }, [projects, searchTerm, statusFilter])

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="פרויקטים"
          subtitle={`${filteredProjects.length} פרויקטים`}
          onMenuClick={() => setMenuOpen(true)}
        />
      )}

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div
        style={{
          ...styles.content,
          ...(isMobile
            ? { padding: '16px 16px 8px', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }
            : {}),
        }}
      >
        {!isMobile && (
          <PageHeader
            title="פרויקטים"
            subtitle="ניהול בניינים ומיקומים"
            actions={
              <Button variant="primary" onClick={openCreateDrawer}>
                פרויקט חדש
              </Button>
            }
          />
        )}

        {loading ? (
          <>
            <PageKpiSkeletonN columns={isMobile ? 3 : 3} />
            <Card noPadding>
              <div style={{ padding: '20px 16px' }}>
                <PageListSkeleton rows={8} />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                  <LoadingSpinner />
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
        {/* KPI Cards */}
        <div style={{
          ...styles.kpiGrid,
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
        }}>
          <KpiCard label="סה״כ פרויקטים" value={stats.total} accent="primary" />
          <KpiCard label="פעילים" value={stats.active} accent="success" />
          <KpiCard label="לא פעילים" value={stats.inactive} />
        </div>

        {/* Filters + Grid */}
        <Card noPadding>
          <div style={{
            ...styles.filtersRow,
            flexDirection: isMobile ? 'column' : 'row',
          }}>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="חיפוש פרויקטים..."
              style={{ flex: 1, maxWidth: isMobile ? '100%' : '320px' }}
            />
            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              options={[
                { label: 'כל הסטטוסים', value: 'ALL' },
                { label: 'פעיל', value: 'ACTIVE' },
                { label: 'לא פעיל', value: 'INACTIVE' },
              ]}
              style={{ minWidth: '140px' }}
            />
          </div>

          {filteredProjects.length === 0 ? (
            <EmptyState
              title="לא נמצאו פרויקטים"
              description="נסו לשנות מסננים או ליצור פרויקט חדש."
              action={
                <Button variant="primary" onClick={openCreateDrawer}>
                  הוספת פרויקט
                </Button>
              }
            />
          ) : (
            <div style={{
              ...styles.projectGrid,
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
            }}>
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => openDetailDrawer(project)}
                  style={styles.projectCard}
                  data-ui="card"
                >
                  <div style={styles.projectHeader}>
                    <div>
                      <div style={styles.projectName}>{project.name}</div>
                    </div>
                    <StatusBadge status={project.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                  </div>

                  <div style={styles.projectMeta}>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>כתובת</span>
                      <span style={styles.metaValue}>{project.address || '-'}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>קוד התחלה</span>
                      <span style={styles.metaCode}>
                        {project.qr_identifier || `START_${project.project_code}`}
                      </span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>עובד אחזקה</span>
                      <span style={styles.metaValue}>
                        {project.assigned_worker_id
                          ? workers.find((w) => w.id === project.assigned_worker_id)?.full_name ?? 'לא ידוע'
                          : 'לא שויך'}
                      </span>
                    </div>
                    <div style={styles.metaItem} onClick={(e) => e.stopPropagation()}>
                      <span style={styles.metaLabel}>שינוי שיבוץ</span>
                      <div style={{ flex: 1, minWidth: 0, maxWidth: '240px' }}>
                        <Select
                          value={project.assigned_worker_id || ''}
                          onChange={(value) => updateProjectAssignedWorker(project.id, value)}
                          options={[
                            { label: 'לא שויך', value: '' },
                            ...workers.map((w) => ({ label: w.full_name, value: w.id })),
                          ]}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={styles.projectActions} onClick={(e) => e.stopPropagation()}>
                    <Button variant="secondary" size="sm" onClick={() => openEditDrawer(project)}>
                      עריכה
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => toggleProjectStatus(project)}>
                      {project.is_active ? 'השבתה' : 'הפעלה'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
          </>
        )}
      </div>

      {/* Create/Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingProject ? 'עריכת פרויקט' : 'פרויקט חדש'}
        subtitle={editingProject ? 'עדכון פרטי פרויקט' : 'יצירת בניין חדש'}
        isMobile={isMobile}
      >
        <div style={styles.drawerContent}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שם פרויקט *</label>
            <input
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="שם הבניין / הפרויקט"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>קוד פרויקט *</label>
            <input
              value={form.project_code}
              onChange={(e) => updateForm('project_code', e.target.value.toUpperCase())}
              placeholder="e.g. PRJ001"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>כתובת</label>
            <input
              value={form.address}
              onChange={(e) => updateForm('address', e.target.value)}
              placeholder="מיקום"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>מזהה QR</label>
            <input
              value={form.qr_identifier}
              onChange={(e) => updateForm('qr_identifier', e.target.value)}
              placeholder={`Default: START_${form.project_code || 'CODE'}`}
              style={styles.input}
            />
            <span style={styles.formHint}>השאירו ריק לשימוש בקוד START ברירת מחדל</span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>עובד אחזקה</label>
            <Select
              value={form.assigned_worker_id}
              onChange={(value) => updateForm('assigned_worker_id', value)}
              options={[
                { label: 'ללא', value: '' },
                ...workers.map((w) => ({ label: w.full_name, value: w.id })),
              ]}
              style={{ width: '100%' }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => updateForm('is_active', e.target.checked)}
                style={styles.checkbox}
              />
              <span>פעיל</span>
            </label>
          </div>

          <div style={styles.drawerActions}>
            <Button variant="secondary" onClick={closeDrawer}>
              ביטול
            </Button>
            <Button variant="primary" onClick={saveProject} loading={saving}>
              {editingProject ? 'שמירה' : 'יצירה'}
            </Button>
          </div>

          {editingProject && (
            <div style={styles.dangerZone}>
              <Button
                variant="danger"
                onClick={() => deleteProject(editingProject)}
                style={{ width: '100%' }}
              >
                מחיקת פרויקט
              </Button>
            </div>
          )}
        </div>
      </Drawer>

      {/* Detail Drawer */}
      <Drawer
        open={detailDrawerOpen}
        onClose={closeDetailDrawer}
        title={selectedProject?.name || ''}
        subtitle={selectedProject?.name}
        isMobile={isMobile}
      >
        {selectedProject && (
          <div style={styles.drawerContent}>
            <div style={styles.detailSection}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>סטטוס</span>
                <StatusBadge status={selectedProject.is_active ? 'ACTIVE' : 'INACTIVE'} />
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>כתובת</span>
                <span style={styles.detailValue}>{selectedProject.address || '-'}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>קוד התחלה</span>
                <span style={styles.detailCode}>
                  {selectedProject.qr_identifier || `START_${selectedProject.project_code}`}
                </span>
              </div>
            </div>

            <div style={styles.ticketsSection}>
              <div style={styles.ticketsSectionHeader}>
                <h4 style={styles.ticketsSectionTitle}>תקלות אחרונות</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = `/tickets?project=${encodeURIComponent(selectedProject.project_code)}`}
                >
                  הכל
                </Button>
              </div>

              {loadingTickets ? (
                <div style={styles.loadingSmall}>
                  <LoadingSpinner size="sm" />
                </div>
              ) : projectTickets.length === 0 ? (
                <p style={styles.emptyText}>אין תקלות לפרויקט זה</p>
              ) : (
                <div style={styles.ticketList}>
                  {projectTickets.slice(0, 5).map((ticket) => (
                    <div key={ticket.id} style={styles.ticketItem}>
                      <span style={styles.ticketNumber}>#{ticket.ticket_number}</span>
                      <StatusBadge status={ticket.status} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.drawerActions}>
              <Button variant="secondary" onClick={() => openEditDrawer(selectedProject)}>
                עריכת פרויקט
              </Button>
              <Button
                variant="primary"
                onClick={() => window.location.href = `/qr?project=${encodeURIComponent(selectedProject.project_code)}`}
              >
                צפייה ב-QR
              </Button>
            </div>

            <div style={styles.dangerZone}>
              <Button
                variant="danger"
                onClick={() => deleteProject(selectedProject)}
                style={{ width: '100%' }}
              >
                מחיקת פרויקט לצמיתות
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  kpiGrid: {
    display: 'grid',
    gap: '16px',
    marginBottom: '24px',
  },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 24px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '32px 0',
  },
  projectGrid: {
    display: 'grid',
    gap: '20px',
    padding: '16px 24px 24px',
  },
  projectCard: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '24px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  projectHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  projectName: {
    fontSize: '17px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  projectCode: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    marginTop: '2px',
  },
  projectMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  metaItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  metaLabel: {
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  metaValue: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
  },
  metaCode: {
    fontSize: '13px',
    fontFamily: 'monospace',
    color: theme.colors.textSecondary,
    background: theme.colors.muted,
    padding: '4px 8px',
    borderRadius: theme.radius.sm,
  },
  projectActions: {
    display: 'flex',
    gap: '8px',
  },
  drawerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  input: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '15px',
    color: theme.colors.textPrimary,
  },
  formHint: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '15px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: theme.colors.primary,
  },
  drawerActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '8px',
  },
  dangerZone: {
    paddingTop: '20px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '12px',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '16px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  detailValue: {
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  detailCode: {
    fontSize: '13px',
    fontFamily: 'monospace',
    color: theme.colors.primary,
  },
  ticketsSection: {
    marginTop: '8px',
  },
  ticketsSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  ticketsSectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  loadingSmall: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 0',
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: '14px',
    padding: '24px 0',
  },
  ticketList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ticketItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: theme.colors.muted,
    borderRadius: theme.radius.sm,
  },
  ticketNumber: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
  },
}
