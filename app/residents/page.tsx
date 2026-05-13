'use client'

/**
 * דף דיירים – ניהול פנקס הדיירים הרשומים בפרויקטים.
 *
 * מציג: טאבים לפי פרויקט, רשימת דיירים עם טלפון, שם, קומה/דירה.
 *
 * פעולות:
 *  - "הוסף דייר" → AddResidentModal → POST /api/create-resident
 *  - "ייבוא Excel" → ImportResidentsModal → POST /api/import-residents (CSV/xlsx)
 *  - מחיקת דייר → DELETE soft
 *
 * קשור ל: /pending-residents (דיירים שדיווחו אך עדיין לא בפנקס)
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { AddResidentModal, type ResidentProjectRow } from '../components/residents/AddResidentModal'
import { ImportResidentsModal } from '../components/residents/ImportResidentsModal'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Card,
  Button,
  SearchInput,
  LoadingSpinner,
  theme,
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageListSkeleton } from '../components/page-skeleton'

function mainTabStyle(active: boolean): CSSProperties {
  return {
    padding: '10px 18px',
    borderRadius: theme.radius.md,
    border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
    background: active ? theme.colors.primaryMuted : theme.colors.surface,
    color: active ? theme.colors.primaryText : theme.colors.textSecondary,
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  }
}

type ResidentRow = {
  id: string
  project_id: string
  client_id?: string | null
  full_name: string
  phone: string | null
  apartment_number: string | null
  notes?: string | null
}

function normalizeResidentPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('972')) return `+${digits}`
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) return `+972${digits}`
  return `+${digits}`
}

function isResidentsTableMissingError(err: { message?: string } | null): boolean {
  if (!err?.message) return false
  const m = err.message.toLowerCase()
  return (
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('could not find') ||
    (m.includes('relation') && m.includes('residents'))
  )
}

export default function ResidentsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ResidentProjectRow[]>([])
  const [residents, setResidents] = useState<ResidentRow[]>([])
  const [residentsTableMissing, setResidentsTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('ALL')
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [editResidentId, setEditResidentId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingResident, setDeletingResident] = useState(false)
  const [addError, setAddError] = useState('')
  const [addProjectId, setAddProjectId] = useState('')
  const [addFullName, setAddFullName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addApartment, setAddApartment] = useState('')
  const [addNotes, setAddNotes] = useState('')

  const [importOpen, setImportOpen] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  type SortKey = 'full_name' | 'phone' | 'apartment_number' | 'project'
  type SortDir = 'asc' | 'desc'
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Read initial filter from URL (?project=ID&q=term)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('project')
    const q = params.get('q')
    if (p) setProjectFilter(p)
    if (q) setSearchTerm(q)
  }, [])

  // Sync filter changes to URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (projectFilter !== 'ALL') params.set('project', projectFilter)
    if (searchTerm.trim()) params.set('q', searchTerm.trim())
    const qs = params.toString()
    const newUrl = qs ? `?${qs}` : window.location.pathname
    router.replace(newUrl, { scroll: false })
  }, [projectFilter, searchTerm, router])

  const [mainTab, setMainTab] = useState<'active' | 'pending'>('active')
  const [pendingItems, setPendingItems] = useState<
    Array<{
      id: string
      project_id: string
      reporter_phone_normalized: string
      created_at: string
      project_name: string
      project_code: string
      ticket_number?: number
    }>
  >([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingBadge, setPendingBadge] = useState(0)
  const [pendingNames, setPendingNames] = useState<Record<string, string>>({})
  const [pendingApartments, setPendingApartments] = useState<Record<string, string>>({})
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null)

  async function loadPending() {
    setPendingLoading(true)
    try {
      const res = await fetchWithTimeout('/api/pending-residents')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'טעינה נכשלה')
      const items = (data.items as typeof pendingItems) || []
      setPendingItems(items)
      setPendingBadge(items.length)
    } catch {
      setPendingItems([])
      setPendingBadge(0)
    } finally {
      setPendingLoading(false)
    }
  }

  async function load() {
    setLoading(true)
    setResidentsTableMissing(false)
    try {
      const tenantId = await resolveBamakorClientIdForBrowser()
      const [pRes, rRes, pendingRes] = await Promise.all([
        withClientId(supabase.from('projects').select('id, name, project_code, client_id'), tenantId).order('name'),
        withClientId(
          supabase.from('residents').select('id, project_id, client_id, full_name, phone, apartment_number, notes'),
          tenantId
        )
          .is('deleted_at', null)
          .order('full_name'),
        fetchWithTimeout('/api/pending-residents'),
      ])

      if (pRes.error) throw pRes.error
      setProjects((pRes.data as ResidentProjectRow[]) || [])

      if (rRes.error) {
        if (isResidentsTableMissingError(rRes.error)) {
          setResidents([])
          setResidentsTableMissing(true)
        } else {
          toast.error(rRes.error.message || TM.genericLoadError)
        }
      } else {
        setResidents((rRes.data as ResidentRow[]) || [])
      }

      try {
        const data = await pendingRes.json()
        if (pendingRes.ok) {
          const items = (data.items as typeof pendingItems) || []
          setPendingItems(items)
          setPendingBadge(items.length)
        } else {
          setPendingItems([])
          setPendingBadge(0)
        }
      } catch {
        setPendingItems([])
        setPendingBadge(0)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericLoadError)
    }
    setLoading(false)
  }

  function openAdd() {
    setEditResidentId(null)
    setAddError('')
    setAddFullName('')
    setAddPhone('')
    setAddApartment('')
    setAddNotes('')
    setAddProjectId(projectFilter !== 'ALL' ? projectFilter : '')
    setAddOpen(true)
  }

  function openEdit(r: ResidentRow) {
    setEditResidentId(r.id)
    setAddError('')
    setAddProjectId(r.project_id)
    setAddFullName(r.full_name)
    setAddPhone(r.phone?.trim() || '')
    setAddApartment(r.apartment_number?.trim() || '')
    setAddNotes(r.notes?.trim() || '')
    setAddOpen(true)
  }

  function closeResidentModal() {
    setAddOpen(false)
    setEditResidentId(null)
    setAddError('')
  }

  function openImport() {
    setImportOpen(true)
  }

  async function deleteResident() {
    if (residentsTableMissing || !editResidentId) return
    const name = addFullName.trim() || 'הדייר'
    if (!window.confirm(`למחוק את ${name} מהרשימה? הפעולה לא ניתנת לשחזור.`)) return

    setDeletingResident(true)
    setAddError('')
    try {
      const tenantDel = await resolveBamakorClientIdForBrowser()
      const { error } = await withClientId(
        supabase.from('residents').update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        tenantDel
      )
        .eq('id', editResidentId)
        .is('deleted_at', null)
      if (error) throw error
      setResidents((prev) => prev.filter((x) => x.id !== editResidentId))
      closeResidentModal()
      toast.success('הדייר נמחק')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'מחיקת דייר נכשלה')
    } finally {
      setDeletingResident(false)
    }
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (residentsTableMissing) return

    const projectId = addProjectId
    const fullName = addFullName.trim()
    if (!projectId) {
      setAddError('בחרו בניין')
      return
    }
    if (!fullName) {
      setAddError('שם מלא הוא שדה חובה')
      return
    }

    const project = projects.find((p) => p.id === projectId)
    const clientId = project?.client_id ?? null

    setSaving(true)
    setAddError('')
    try {
      if (editResidentId) {
        const scoped = await resolveBamakorClientIdForBrowser()
        const updateRes = await withClientId(
          supabase.from('residents').update({
            project_id: projectId,
            client_id: clientId,
            full_name: fullName,
            phone: normalizeResidentPhone(addPhone) || null,
            apartment_number: addApartment.trim() || null,
            notes: addNotes.trim() || null,
          }),
          scoped
        )
          .eq('id', editResidentId)
          .select('id, project_id, client_id, full_name, phone, apartment_number, notes')
          .single()

        if (updateRes.error) {
          const msg = updateRes.error.message || TM.genericSaveError
          setAddError(msg)
          toast.error(msg)
          return
        }

        const row = updateRes.data as ResidentRow
        setResidents((prev) => prev.map((x) => (x.id === row.id ? row : x)))
        closeResidentModal()
        toast.success(TM.residentUpdated)
        return
      }

      const insertRes = await supabase
        .from('residents')
        .insert({
          project_id: projectId,
          client_id: clientId,
          full_name: fullName,
          phone: normalizeResidentPhone(addPhone) || null,
          apartment_number: addApartment.trim() || null,
          notes: addNotes.trim() || null,
        })
        .select('id, project_id, client_id, full_name, phone, apartment_number, notes')
        .single()

      if (insertRes.error) {
        const msg = insertRes.error.message || TM.genericSaveError
        setAddError(msg)
        toast.error(msg)
        return
      }

      setResidents((prev) => [insertRes.data as ResidentRow, ...prev])
      closeResidentModal()
      toast.success(TM.residentAdded)
    } catch (err) {
      const msg = err instanceof Error ? err.message : TM.genericSaveError
      setAddError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    void load()
    // load is defined above and stable — intentional empty deps for mount-only call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount only

  useEffect(() => {
    if (mainTab === 'pending') void loadPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab])

  // Refresh pending badge whenever the browser tab regains focus
  useEffect(() => {
    const onFocus = () => void loadPending()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function displayPendingPhone(digits: string) {
    const d = digits.replace(/\D/g, '')
    if (d.startsWith('972')) return `+${d}`
    if (d.startsWith('0')) return `+972${d.slice(1)}`
    return d ? `+${d}` : '—'
  }

  async function approvePending(id: string) {
    setPendingBusyId(id)
    try {
      const res = await fetchWithTimeout('/api/pending-residents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action: 'approve',
          full_name: pendingNames[id]?.trim() || undefined,
          apartment_number: pendingApartments[id]?.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error([data.error, data.hint].filter(Boolean).join('\n') || 'פעולה נכשלה')
      toast.success(TM.residentApproved)
      await loadPending()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'פעולה נכשלה')
    } finally {
      setPendingBusyId(null)
    }
  }

  async function rejectPending(id: string) {
    setPendingBusyId(id)
    try {
      const res = await fetchWithTimeout('/api/pending-residents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error([data.error, data.hint].filter(Boolean).join('\n') || 'פעולה נכשלה')
      toast.success(TM.residentRejected)
      await loadPending()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'פעולה נכשלה')
    } finally {
      setPendingBusyId(null)
    }
  }

  const projectName = useMemo(() => {
    const m: Record<string, string> = {}
    projects.forEach((p) => { m[p.id] = p.name })
    return m
  }, [projects])

  // For each pending item: if its phone already exists in the residents list (any project), return info
  const pendingConflictMap = useMemo(() => {
    const result: Record<string, { residentName: string; projectName: string }> = {}
    for (const p of pendingItems) {
      const pDigits = p.reporter_phone_normalized.replace(/\D/g, '')
      const match = residents.find((r) => (r.phone || '').replace(/\D/g, '') === pDigits)
      if (match) {
        result[p.id] = {
          residentName: match.full_name,
          projectName: projectName[match.project_id] || '',
        }
      }
    }
    return result
  }, [pendingItems, residents, projectName])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return residents.filter((r) => {
      const byProject = projectFilter === 'ALL' || r.project_id === projectFilter
      const text =
        !q ||
        r.full_name.toLowerCase().includes(q) ||
        (r.phone || '').includes(q) ||
        (r.apartment_number || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
      return byProject && text
    })
  }, [residents, searchTerm, projectFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = ''
      let bv = ''
      if (sortKey === 'full_name') { av = a.full_name; bv = b.full_name }
      else if (sortKey === 'phone') { av = a.phone || ''; bv = b.phone || '' }
      else if (sortKey === 'apartment_number') {
        const na = parseInt(a.apartment_number || '0', 10)
        const nb = parseInt(b.apartment_number || '0', 10)
        if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
        av = a.apartment_number || ''; bv = b.apartment_number || ''
      }
      else if (sortKey === 'project') { av = projectName[a.project_id] || ''; bv = projectName[b.project_id] || '' }
      return sortDir === 'asc' ? av.localeCompare(bv, 'he') : bv.localeCompare(av, 'he')
    })
  }, [filtered, sortKey, sortDir, projectName])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone).then(() => toast.success('טלפון הועתק')).catch(() => {})
  }

  function exportCsv() {
    const rows = sorted.map((r) => ({
      'שם מלא': r.full_name,
      'טלפון': r.phone || '',
      'דירה': r.apartment_number || '',
      'בניין': projectName[r.project_id] || '',
      'הערות': r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'דיירים')
    XLSX.writeFile(wb, 'דיירים.xlsx')
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)))
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    if (!window.confirm(`למחוק ${count} דיירים? לא ניתן לשחזר.`)) return
    setBulkDeleting(true)
    try {
      const scoped = await resolveBamakorClientIdForBrowser()
      const { error } = await withClientId(
        supabase
          .from('residents')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(selectedIds)),
        scoped
      )
      if (error) throw error
      setResidents((prev) => prev.filter((r) => !selectedIds.has(r.id)))
      setSelectedIds(new Set())
      toast.success(`${count} דיירים נמחקו`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'מחיקה נכשלה')
    } finally {
      setBulkDeleting(false)
    }
  }

  // Escape סוגר מודאלים
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (addOpen) { closeResidentModal(); return }
      if (importOpen) { setImportOpen(false); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen, importOpen])

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="דיירים"
          subtitle={`${filtered.length} רשומות`}
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
            title="דיירים"
            subtitle="ניהול שמות דיירים לפי בניין (לאחר הרצת מיגרציה ב-Supabase)"
            actions={
              <div style={{ display: 'flex', gap: '10px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openImport}
                  disabled={residentsTableMissing}
                >
                  ייבוא דיירים
                </Button>
                <Button variant="primary" size="sm" onClick={openAdd} disabled={residentsTableMissing}>
                  הוספת דייר
                </Button>
              </div>
            }
          />
        )}

        <Card noPadding>
          <div className="app-error-log-tabs" style={styles.mainTabs}>
            <button
              type="button"
              style={mainTabStyle(mainTab === 'active')}
              onClick={() => setMainTab('active')}
            >
              פעילים
            </button>
            <button
              type="button"
              style={mainTabStyle(mainTab === 'pending')}
              onClick={() => setMainTab('pending')}
            >
              ממתינים לאישור
              {pendingBadge > 0 && <span style={styles.pendingBadge}>{pendingBadge}</span>}
            </button>
          </div>

          {mainTab === 'pending' ? (
            <div style={styles.pendingWrap}>
              {pendingLoading ? (
                <div style={styles.loading}>
                  <LoadingSpinner />
                </div>
              ) : pendingItems.length === 0 ? (
                <p style={styles.empty}>אין בקשות ממתינות.</p>
              ) : (
                <div style={styles.pendingList}>
                  {pendingItems.map((p) => {
                    const conflict = pendingConflictMap[p.id]
                    const hasName = !!pendingNames[p.id]?.trim()
                    return (
                    <div key={p.id} style={styles.pendingCard}>
                      {conflict && (
                        <div style={styles.pendingConflict}>
                          טלפון זה רשום כבר כדייר &quot;{conflict.residentName}&quot; בבניין {conflict.projectName}
                        </div>
                      )}
                      <div style={styles.pendingRow}>
                        <span style={styles.pendingLabel}>טלפון</span>
                        <span>{displayPendingPhone(p.reporter_phone_normalized)}</span>
                      </div>
                      <div style={styles.pendingRow}>
                        <span style={styles.pendingLabel}>פרויקט</span>
                        <span>{p.project_name}</span>
                      </div>
                      {p.ticket_number != null && (
                        <div style={styles.pendingRow}>
                          <span style={styles.pendingLabel}>תקלה</span>
                          <span>#{p.ticket_number}</span>
                        </div>
                      )}
                      <label style={styles.pendingNameLab}>
                        שם דייר <span style={{ color: theme.colors.error }}>*</span>
                      </label>
                      <input
                        value={pendingNames[p.id] || ''}
                        onChange={(e) => setPendingNames((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="שם מלא (חובה)"
                        style={{
                          ...styles.pendingInput,
                          borderColor: !hasName ? theme.colors.error : theme.colors.border,
                        }}
                      />
                      <label style={styles.pendingNameLab}>דירה (אופציונלי)</label>
                      <input
                        value={pendingApartments[p.id] || ''}
                        onChange={(e) => setPendingApartments((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="מספר דירה"
                        style={styles.pendingInput}
                      />
                      <div style={styles.pendingActions}>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!hasName}
                          loading={pendingBusyId === p.id}
                          onClick={() => approvePending(p.id)}
                        >
                          אישור
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={pendingBusyId === p.id}
                          onClick={() => rejectPending(p.id)}
                        >
                          דחייה
                        </Button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
          <div style={styles.filters}>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="חיפוש לפי שם, טלפון, דירה, הערות..."
              style={{ flex: 1, maxWidth: '360px' }}
            />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              style={styles.select}
            >
              <option value="ALL">כל הבניינים</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={() => load()}>
              רענון
            </Button>
            <Button variant="secondary" size="sm" onClick={openImport} disabled={residentsTableMissing}>
              ייבוא דיירים
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              ייצוא Excel
            </Button>
            <Button variant="primary" size="sm" onClick={openAdd} disabled={residentsTableMissing}>
              הוספת דייר
            </Button>
          </div>

          {loading ? (
            <div style={styles.loading}>
              <PageListSkeleton rows={10} />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                <LoadingSpinner size="md" />
              </div>
            </div>
          ) : residentsTableMissing ? (
            <div style={styles.friendlyEmpty}>
              <p style={styles.friendlyEmptyTitle}>טבלת הדיירים עדיין לא הוגדרה במערכת.</p>
            </div>
          ) : (
            <div style={styles.tableWrap}>
              {selectedIds.size > 0 && (
                <div style={styles.bulkBar}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>{selectedIds.size} נבחרו</span>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())} type="button">
                    ביטול בחירה
                  </Button>
                  <Button variant="danger" size="sm" onClick={bulkDelete} loading={bulkDeleting} type="button">
                    מחק {selectedIds.size} נבחרים
                  </Button>
                </div>
              )}

              {/* Mobile: card view */}
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px 0' }}>
                  {sorted.map((r) => (
                    <div key={r.id} style={{ background: selectedIds.has(r.id) ? theme.colors.primaryMuted : theme.colors.surface, border: `1px solid ${selectedIds.has(r.id) ? theme.colors.primary : theme.colors.border}`, borderRadius: theme.radius.md, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} aria-label={`בחר ${r.full_name}`} />
                          <span style={{ fontWeight: 600, fontSize: '15px', color: theme.colors.textPrimary }}>{r.full_name}</span>
                        </div>
                        <Button variant="secondary" size="sm" type="button" onClick={() => openEdit(r)}>עריכה</Button>
                      </div>
                      {r.phone && (
                        <button type="button" onClick={() => copyPhone(r.phone!)} title="לחץ להעתקה" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.primary, fontFamily: 'inherit', fontSize: '14px', padding: 0, direction: 'ltr', textAlign: 'right', alignSelf: 'flex-start' }}>
                          {r.phone}
                        </button>
                      )}
                      <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: theme.colors.textSecondary }}>
                        {r.apartment_number && <span>דירה {r.apartment_number}</span>}
                        {projectName[r.project_id] && <span>{projectName[r.project_id]}</span>}
                      </div>
                      {r.notes && <p style={{ fontSize: '12px', color: theme.colors.textMuted, margin: 0 }}>{r.notes.length > 100 ? `${r.notes.slice(0, 100)}…` : r.notes}</p>}
                    </div>
                  ))}
                  {sorted.length === 0 && <p style={styles.empty}>אין דיירים להצגה.</p>}
                </div>
              ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                        onChange={toggleSelectAll}
                        aria-label="בחר הכל"
                      />
                    </th>
                    <th style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('full_name')}>שם{sortArrow('full_name')}</th>
                    <th style={styles.th}>טלפון</th>
                    <th style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('apartment_number')}>דירה{sortArrow('apartment_number')}</th>
                    <th style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('project')}>בניין{sortArrow('project')}</th>
                    <th style={styles.th}>הערות</th>
                    <th style={{ ...styles.th, width: '100px' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} style={selectedIds.has(r.id) ? { background: theme.colors.primaryMuted } : undefined}>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          aria-label={`בחר ${r.full_name}`}
                        />
                      </td>
                      <td style={styles.td}>{r.full_name}</td>
                      <td style={styles.td}>
                        {r.phone ? (
                          <button
                            type="button"
                            title="לחץ להעתקה"
                            onClick={() => copyPhone(r.phone!)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.primary, fontFamily: 'inherit', fontSize: 'inherit', padding: 0, direction: 'ltr', display: 'inline-block' }}
                          >
                            {r.phone}
                          </button>
                        ) : '—'}
                      </td>
                      <td style={styles.td}>{r.apartment_number || '—'}</td>
                      <td style={styles.td}>{projectName[r.project_id] || '—'}</td>
                      <td style={{ ...styles.td, maxWidth: '220px', color: theme.colors.textSecondary }}>
                        {r.notes ? (
                          <span title={r.notes}>
                            {r.notes.length > 80 ? `${r.notes.slice(0, 80)}…` : r.notes}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={styles.td}>
                        <Button variant="secondary" size="sm" type="button" onClick={() => openEdit(r)}>
                          עריכה
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
              {filtered.length === 0 && !isMobile && (
                <p style={styles.empty}>אין דיירים להצגה. הוסיפו רשומות ב-Supabase.</p>
              )}
            </div>
          )}
            </>
          )}
        </Card>
      </div>

      <AddResidentModal
        open={addOpen}
        onClose={closeResidentModal}
        isMobile={isMobile}
        projects={projects}
        projectId={addProjectId}
        fullName={addFullName}
        phone={addPhone}
        apartmentNumber={addApartment}
        notes={addNotes}
        error={addError}
        loading={saving}
        variant={editResidentId ? 'edit' : 'add'}
        onDelete={editResidentId ? deleteResident : undefined}
        deleteLoading={deletingResident}
        onProjectIdChange={setAddProjectId}
        onFullNameChange={setAddFullName}
        onPhoneChange={setAddPhone}
        onApartmentNumberChange={setAddApartment}
        onNotesChange={setAddNotes}
        onSubmit={submitAdd}
      />

      <ImportResidentsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        isMobile={isMobile}
        projects={projects}
        defaultProjectId={projectFilter !== 'ALL' ? projectFilter : ''}
        onImported={(newRows) => {
          setResidents((prev) => [...(newRows as ResidentRow[]), ...prev])
        }}
      />
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: { padding: '32px 40px', maxWidth: '1200px', margin: '0 auto' },
  mainTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  pendingBadge: {
    background: theme.colors.warning,
    color: '#fff',
    fontSize: '11px',
    minWidth: '22px',
    height: '22px',
    borderRadius: '11px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 7px',
  },
  pendingWrap: { padding: '0 0 8px' },
  pendingList: { padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' },
  pendingCard: {
    padding: '16px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
  },
  pendingConflict: {
    marginBottom: '12px',
    padding: '10px 14px',
    borderRadius: theme.radius.sm,
    background: theme.colors.warningMuted,
    border: `1px solid ${theme.colors.warning}`,
    fontSize: '13px',
    color: theme.colors.textPrimary,
    fontWeight: 500,
  },
  pendingRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', fontSize: '14px' },
  pendingLabel: { color: theme.colors.textMuted, fontWeight: 600 },
  pendingNameLab: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    marginTop: '8px',
    marginBottom: '6px',
  },
  pendingInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '15px',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  pendingActions: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  select: {
    padding: '10px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '15px',
    minWidth: '200px',
  },
  loading: { padding: '48px', display: 'flex', justifyContent: 'center' },
  tableWrap: { padding: '0 0 24px', overflowX: 'auto' },
  bulkBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 20px',
    background: theme.colors.primaryMuted,
    borderBottom: `1px solid ${theme.colors.primary}44`,
    flexWrap: 'wrap' as const,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'start',
    padding: '12px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    background: theme.colors.muted,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  td: {
    padding: '14px 20px',
    fontSize: '14px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  empty: { padding: '32px 24px', color: theme.colors.textMuted, textAlign: 'center' },
  friendlyEmpty: {
    padding: '48px 28px',
    textAlign: 'center',
    maxWidth: '520px',
    margin: '0 auto',
  },
  friendlyEmptyTitle: {
    fontSize: '17px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    margin: '0 0 12px',
  },
  friendlyEmptyText: {
    fontSize: '15px',
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
}
