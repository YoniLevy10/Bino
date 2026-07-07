'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import type { ResidentProjectRow } from './AddResidentModal'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import {
  buildResidentsImportPayload,
  parseResidentsWorkbook,
  type ParsedRow,
  type ResidentsColumnMapping,
  type ResidentsImportPayloadRow,
} from '@/lib/import-residents-excel'
import { TM } from '@/lib/toast-messages'

export function ImportResidentsModal({
  open,
  onClose,
  isMobile,
  projects,
  defaultProjectId,
  onImported,
}: {
  open: boolean
  onClose: () => void
  isMobile?: boolean
  projects: ResidentProjectRow[]
  defaultProjectId: string
  onImported: (newRows: unknown[]) => void
}) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  const [mapping, setMapping] = useState<ResidentsColumnMapping>({
    full_name: '',
  })

  const [singleProjectId, setSingleProjectId] = useState<string>(defaultProjectId || '')
  const [importing, setImporting] = useState(false)
  const [apiError, setApiError] = useState('')

  const preview = useMemo(() => {
    const project = singleProjectId ? projects.find((p) => p.id === singleProjectId) : null
    return buildResidentsImportPayload(rows, mapping, {
      forcedProjectCode: project?.project_code || null,
      forcedProjectName: project?.name || null,
    }).slice(0, 20)
  }, [rows, mapping, singleProjectId, projects])

  const canImport = useMemo(() => {
    if (rows.length === 0) return false
    if (!mapping.full_name) return false
    const hasProjectMapping = Boolean(mapping.project_code || mapping.project_name || singleProjectId)
    return hasProjectMapping
  }, [rows.length, mapping, singleProjectId])

  if (!open) return null

  function reset() {
    setFileName('')
    setRows([])
    setHeaders([])
    setDragOver(false)
    setApiError('')
    setMapping({ full_name: '' })
    setSingleProjectId(defaultProjectId || '')
  }

  function close() {
    reset()
    onClose()
  }

  async function parseFile(file: File) {
    setApiError('')
    const buf = await file.arrayBuffer()
    const parsed = parseResidentsWorkbook(buf)

    setFileName(file.name)
    setRows(parsed.rows)
    setHeaders(parsed.headers)
    setMapping(parsed.mapping)
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    await parseFile(f)
  }

  async function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    await parseFile(f)
  }

  function buildPayload(): ResidentsImportPayloadRow[] {
    const project = singleProjectId ? projects.find((p) => p.id === singleProjectId) : null
    return buildResidentsImportPayload(rows, mapping, {
      forcedProjectCode: project?.project_code || null,
      forcedProjectName: project?.name || null,
    })
  }

  async function doImport() {
    if (!canImport) return
    setImporting(true)
    setApiError('')
    try {
      const payloadRows = buildPayload()
      const res = await fetchWithTimeout('/api/import-residents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: payloadRows }),
      })

      const json: unknown = await res.json()
      if (!res.ok) {
        const errMsg = errorMessageFromResponseJson(json as { error?: unknown }, 'ייבוא נכשל')
        setApiError(errMsg)
        toast.error(errMsg)
        return
      }

      const inserted = Number((json as { inserted?: unknown } | null)?.inserted || 0)
      const failed = Number((json as { failed?: unknown } | null)?.failed || 0)
      if (inserted > 0 && failed > 0) toast.success(TM.csvImportPartial(inserted, failed))
      else if (inserted > 0) toast.success(TM.csvImported(inserted))
      if (failed > 0 && inserted === 0) toast.error(`${failed} שורות נכשלו — בדקו שגיאות`)

      const residents = (json as { residents?: unknown } | null)?.residents
      if (Array.isArray(residents)) {
        onImported(residents)
      }
      close()
    } catch (e) {
      const msg = e instanceof Error ? e.message : TM.genericSaveError
      setApiError(msg)
      toast.error(msg)
    } finally {
      setImporting(false)
    }
  }

  const scrollAreaStyle: CSSProperties = isMobile
    ? { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }
    : { maxHeight: 'calc(92vh - 120px)', overflow: 'auto' }

  const modalPanel = (
    <div className={isMobile ? 'app-modal-sheet-root' : undefined} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>ייבוא דיירים מקובץ</h2>
          <button
            type="button"
            onClick={close}
            className="app-modal-close"
            style={styles.modalClose}
            aria-label="סגירה"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div
          className={isMobile ? 'app-modal-sheet-scroll' : undefined}
          style={scrollAreaStyle}
        >
        <div style={styles.body}>
          <div
            style={{
              ...styles.dropZone,
              ...(dragOver ? styles.dropZoneActive : {}),
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div style={styles.dropTitle}>גררו קובץ Excel/CSV לכאן</div>
            <div style={styles.dropSub}>או בחרו קובץ מהמחשב</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileInput} />
            {fileName && <div style={styles.fileName}>{fileName}</div>}
          </div>

          {headers.length > 0 && (
            <div style={styles.mappingCard}>
              <div style={styles.mappingTitle}>מיפוי עמודות (אוטומטי, ניתן לשינוי)</div>

              <div style={styles.row}>
                <label style={styles.label}>בניין (אופציונלי)</label>
                <select
                  className="app-select-input"
                  value={singleProjectId}
                  onChange={(e) => setSingleProjectId(e.target.value)}
                  style={styles.select}
                >
                  <option value="">לפי עמודה בקובץ</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {!singleProjectId && (
                <div className="app-import-grid" style={styles.grid2}>
                  <div style={styles.row}>
                    <label style={styles.label}>עמודת קוד בניין</label>
                    <select
                      className="app-select-input"
                      value={mapping.project_code || ''}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, project_code: e.target.value || undefined }))
                      }
                      style={styles.select}
                    >
                      <option value="">—</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.row}>
                    <label style={styles.label}>עמודת שם בניין</label>
                    <select
                      className="app-select-input"
                      value={mapping.project_name || ''}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, project_name: e.target.value || undefined }))
                      }
                      style={styles.select}
                    >
                      <option value="">—</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="app-import-grid" style={styles.grid2}>
                <div style={styles.row}>
                  <label style={styles.label}>עמודת שם מלא</label>
                  <select
                    className="app-select-input"
                    value={mapping.full_name}
                    onChange={(e) => setMapping((m) => ({ ...m, full_name: e.target.value }))}
                    style={styles.select}
                  >
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>עמודת טלפון</label>
                  <select
                    className="app-select-input"
                    value={mapping.phone || ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, phone: e.target.value || undefined }))
                    }
                    style={styles.select}
                  >
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>עמודת דירה</label>
                  <select
                    className="app-select-input"
                    value={mapping.apartment_number || ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, apartment_number: e.target.value || undefined }))
                    }
                    style={styles.select}
                  >
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>עמודת הערות</label>
                  <select
                    className="app-select-input"
                    value={mapping.notes || ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, notes: e.target.value || undefined }))
                    }
                    style={styles.select}
                  >
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={styles.hint}>
                טיפ: אם הקובץ הוא לבניין אחד, בחרו אותו למעלה כדי לא להתעסק בעמודות בניין.
              </div>
            </div>
          )}

          {preview.length > 0 && (
            <div style={styles.previewCard}>
              <div style={styles.previewTitle}>תצוגה מקדימה (20 שורות)</div>
              <div style={styles.previewTableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>שם</th>
                      <th style={styles.th}>טלפון</th>
                      <th style={styles.th}>דירה</th>
                      <th style={styles.th}>בניין</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{r.full_name}</td>
                        <td style={styles.td}>{r.phone}</td>
                        <td style={styles.td}>{r.apartment_number}</td>
                        <td style={styles.td}>
                          {singleProjectId
                            ? projects.find((p) => p.id === singleProjectId)?.name || ''
                            : r.project_name || r.project_code || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {apiError && <div style={styles.errorBox}>{apiError}</div>}
        </div>
        </div>

        <div className={isMobile ? 'app-modal-sheet-footer' : undefined} style={styles.footer}>
          <Button variant="secondary" onClick={close} type="button">
            ביטול
          </Button>
          <Button
            variant="primary"
            onClick={doImport}
            loading={importing}
            disabled={!canImport}
            type="button"
          >
            ייבוא
          </Button>
        </div>
    </div>
  )

  if (isMobile) {
    return (
      <div
        className="app-modal-backdrop-mobile"
        style={styles.modalOverlay}
        onClick={close}
        role="presentation"
      >
        <div onClick={(e) => e.stopPropagation()} role="presentation" style={{ width: '100%' }}>
          {modalPanel}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={styles.modalOverlay} onClick={close} />
      {modalPanel}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    zIndex: 400,
  },
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '92%',
    maxWidth: '860px',
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    zIndex: 401,
    maxHeight: '92vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  modalTitle: { fontSize: '18px', fontWeight: 600, margin: 0, color: theme.colors.textPrimary },
  modalClose: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: theme.radius.sm,
    background: 'transparent',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
  },
  body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  dropZone: {
    border: `1px dashed ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '16px',
    background: theme.colors.surfaceElevated,
  },
  dropZoneActive: {
    border: `1px dashed ${theme.colors.primary}`,
    boxShadow: `0 0 0 3px ${theme.colors.primary}22`,
  },
  dropTitle: { fontSize: '15px', fontWeight: 600, marginBottom: '6px' },
  dropSub: { fontSize: '13px', color: theme.colors.textMuted, marginBottom: '10px' },
  fileName: { marginTop: '10px', fontSize: '13px', color: theme.colors.textSecondary },
  mappingCard: {
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '14px',
    background: theme.colors.surface,
  },
  mappingTitle: { fontSize: '14px', fontWeight: 600, marginBottom: '10px' },
  row: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '12px', fontWeight: 600, color: theme.colors.textMuted },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surfaceElevated,
    color: theme.colors.textPrimary,
    fontSize: '16px',
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' },
  hint: { marginTop: '10px', fontSize: '12px', color: theme.colors.textMuted },
  previewCard: {
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '14px',
    background: theme.colors.surface,
  },
  previewTitle: { fontSize: '14px', fontWeight: 600, marginBottom: '10px' },
  previewTableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'start',
    padding: '10px 12px',
    fontSize: '12px',
    fontWeight: 700,
    color: theme.colors.textMuted,
    background: theme.colors.muted,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  td: { padding: '10px 12px', fontSize: '13px', borderBottom: `1px solid ${theme.colors.border}` },
  errorBox: {
    padding: '10px 12px',
    background: theme.colors.errorMuted,
    color: theme.colors.error,
    borderRadius: theme.radius.md,
    fontSize: '13px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '16px 20px',
    borderTop: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
}

