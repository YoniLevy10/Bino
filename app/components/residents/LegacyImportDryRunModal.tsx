'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import type { ResidentProjectRow } from './AddResidentModal'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import {
  buildResidentsImportPayload,
  parseResidentsWorkbook,
  type ParsedRow,
  type ResidentsColumnMapping,
} from '@/lib/import-residents-excel'

type DryRunSummary = {
  totalRows: number
  validRows: number
  skipped: number
  failed: number
  warnings: number
  dryRun: boolean
}

type DryRunError = { rowIndex: number; error: string; severity: 'error' | 'warning' }

/**
 * Legacy-system import wizard — validation report only.
 * Always posts dryRun:true; never offers a live write path.
 */
export function LegacyImportDryRunModal({
  open,
  onClose,
  isMobile,
  projects,
  defaultProjectId,
}: {
  open: boolean
  onClose: () => void
  isMobile?: boolean
  projects: ResidentProjectRow[]
  defaultProjectId: string
}) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [mapping, setMapping] = useState<ResidentsColumnMapping>({ full_name: '' })
  const [singleProjectId, setSingleProjectId] = useState(defaultProjectId || '')
  const [busy, setBusy] = useState(false)
  const [apiError, setApiError] = useState('')
  const [summary, setSummary] = useState<DryRunSummary | null>(null)
  const [errors, setErrors] = useState<DryRunError[]>([])

  const canValidate = useMemo(() => {
    if (rows.length === 0 || !mapping.full_name) return false
    return Boolean(mapping.project_code || mapping.project_name || singleProjectId)
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
    setSummary(null)
    setErrors([])
  }

  function close() {
    reset()
    onClose()
  }

  async function parseFile(file: File) {
    setApiError('')
    setSummary(null)
    setErrors([])
    try {
      const buf = await file.arrayBuffer()
      const parsed = await parseResidentsWorkbook(buf, { fileName: file.name })
      setFileName(file.name)
      setRows(parsed.rows)
      setHeaders(parsed.headers)
      setMapping(parsed.mapping)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'קריאת הקובץ נכשלה'
      setApiError(msg)
      toast.error(msg)
    }
  }

  async function runDryRun() {
    if (!canValidate) return
    setBusy(true)
    setApiError('')
    setSummary(null)
    setErrors([])
    try {
      const project = singleProjectId ? projects.find((p) => p.id === singleProjectId) : null
      const payloadRows = buildResidentsImportPayload(rows, mapping, {
        forcedProjectCode: project?.project_code || null,
        forcedProjectName: project?.name || null,
      })
      const res = await fetchWithTimeout(
        '/api/import-residents',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rows: payloadRows, dryRun: true }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: unknown
        summary?: DryRunSummary
        errors?: DryRunError[]
      }
      if (!res.ok) {
        const errMsg = errorMessageFromResponseJson(json, 'בדיקת הייבוא נכשלה')
        setApiError(errMsg)
        toast.error(errMsg)
        return
      }
      setSummary(json.summary ?? null)
      setErrors(Array.isArray(json.errors) ? json.errors : [])
      toast.success('דוח בדיקה מוכן — לא בוצעה כתיבה למערכת')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאת חיבור'
      setApiError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const modalPanel = (
    <div className={isMobile ? 'app-modal-sheet-root' : undefined} style={styles.modal}>
      <div style={styles.modalHeader}>
        <h2 style={styles.modalTitle}>ייבוא ממערכת קודמת — בדיקה בלבד</h2>
        <button type="button" onClick={close} className="app-modal-close" style={styles.modalClose} aria-label="סגירה">
          ×
        </button>
      </div>

      <div
        className={isMobile ? 'app-modal-sheet-scroll' : undefined}
        style={isMobile ? { flex: 1, minHeight: 0, overflow: 'auto' } : { maxHeight: 'calc(92vh - 120px)', overflow: 'auto' }}
      >
        <div style={styles.body}>
          <p style={styles.banner}>
            שלב זה מריץ dry-run בלבד: ספירות, כפילויות וחוסמים. <strong>אפס כתיבות</strong> למסד.
            ייבוא חי ייפתח רק אחרי קובץ דוגמה ואישור כתוב.
          </p>

          <div
            style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void parseFile(f)
            }}
          >
            <div style={styles.dropTitle}>גררו קובץ Excel/CSV לכאן</div>
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void parseFile(f)
              }}
            />
            {fileName ? <div style={styles.fileName}>{fileName}</div> : null}
          </div>

          {headers.length > 0 ? (
            <div style={styles.mappingCard}>
              <div style={styles.mappingTitle}>מיפוי עמודות</div>
              <div style={styles.row}>
                <label style={styles.label}>בניין (אופציונלי — לכל הקובץ)</label>
                <select
                  className="app-select-input"
                  value={singleProjectId}
                  onChange={(e) => setSingleProjectId(e.target.value)}
                  style={styles.select}
                >
                  <option value="">— לפי עמודות בקובץ —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.row}>
                <label style={styles.label}>עמודת שם *</label>
                <select
                  className="app-select-input"
                  value={mapping.full_name || ''}
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
                  onChange={(e) => setMapping((m) => ({ ...m, phone: e.target.value || undefined }))}
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
          ) : null}

          {summary ? (
            <div style={styles.reportCard}>
              <div style={styles.mappingTitle}>דוח בדיקה</div>
              <ul style={styles.reportList}>
                <li>סה״כ שורות בקובץ: {summary.totalRows}</li>
                <li>תקינות לייבוא (לו היו כותבים): {summary.validRows}</li>
                <li>כפילויות / דילוגים: {summary.skipped}</li>
                <li>חוסמים (שגיאות): {summary.failed}</li>
                <li>אזהרות: {summary.warnings}</li>
                <li style={{ fontWeight: 800, color: theme.colors.primary }}>dryRun: כן — לא נכתב דבר</li>
              </ul>
              {errors.length > 0 ? (
                <div style={styles.errorList}>
                  {errors.slice(0, 40).map((e, i) => (
                    <div key={`${e.rowIndex}-${i}`} style={styles.errorRow}>
                      <span style={{ color: e.severity === 'error' ? theme.colors.error : theme.colors.warning }}>
                        {e.severity === 'error' ? 'חוסם' : 'אזהרה'}
                      </span>
                      {' · '}
                      שורה {e.rowIndex + 1}: {e.error}
                    </div>
                  ))}
                  {errors.length > 40 ? (
                    <div style={styles.hint}>…ועוד {errors.length - 40} פריטים</div>
                  ) : null}
                </div>
              ) : (
                <p style={styles.hint}>אין חוסמים או אזהרות בדוח.</p>
              )}
            </div>
          ) : null}

          {apiError ? <div style={styles.errorBox}>{apiError}</div> : null}
        </div>
      </div>

      <div className={isMobile ? 'app-modal-sheet-footer' : undefined} style={styles.footer}>
        <Button variant="secondary" onClick={close} type="button">
          סגור
        </Button>
        <Button
          variant="primary"
          onClick={() => void runDryRun()}
          loading={busy}
          disabled={!canValidate}
          type="button"
        >
          הרץ בדיקה (ללא כתיבה)
        </Button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div className="app-modal-backdrop-mobile" style={styles.modalOverlay} onClick={close} role="presentation">
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
    maxWidth: 720,
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
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 800 },
  modalClose: {
    border: 'none',
    background: 'transparent',
    fontSize: 28,
    lineHeight: 1,
    cursor: 'pointer',
    color: theme.colors.textSecondary,
  },
  body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  banner: {
    margin: 0,
    padding: '10px 12px',
    borderRadius: 12,
    background: theme.colors.primaryMuted,
    fontSize: 13,
    lineHeight: 1.45,
  },
  dropZone: {
    border: `1.5px dashed ${theme.colors.border}`,
    borderRadius: 14,
    padding: 20,
    textAlign: 'center',
  },
  dropZoneActive: { borderColor: theme.colors.primary, background: theme.colors.primaryMuted },
  dropTitle: { fontWeight: 700, marginBottom: 8 },
  fileName: { marginTop: 8, fontSize: 13, color: theme.colors.textSecondary },
  mappingCard: {
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 14,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  mappingTitle: { fontWeight: 800, fontSize: 14 },
  row: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 700, color: theme.colors.textSecondary },
  select: { width: '100%', padding: '10px 12px', borderRadius: 12, fontSize: 16 },
  reportCard: {
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 14,
    padding: 14,
  },
  reportList: { margin: '8px 0 0', paddingInlineStart: 18, lineHeight: 1.6, fontSize: 14 },
  errorList: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflow: 'auto' },
  errorRow: { fontSize: 12, lineHeight: 1.4 },
  hint: { fontSize: 12, color: theme.colors.textSecondary, margin: '8px 0 0' },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    background: '#FEE2E2',
    color: '#991B1B',
    fontSize: 13,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: 16,
    borderTop: `1px solid ${theme.colors.border}`,
  },
}
