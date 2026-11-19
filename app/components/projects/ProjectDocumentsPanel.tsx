'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/errors/error-handler'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { Button, Select, theme } from '../ui'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'

type DocRow = {
  id: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  notes: string | null
  created_at: string
  download_url: string | null
}

export const PROJECT_DOCUMENT_DRAG_MIME = 'application/x-bino-project-document-id'

export type DocumentMoveFolderOption = {
  id: string
  label: string
}

type Props = {
  /** Building scope; optional when folder is independent. */
  projectId?: string | null
  folderId?: string | null
  folderName?: string | null
  /** Target folders for mobile «העבר לתיקייה» and drag-drop hints. */
  moveFolderOptions?: DocumentMoveFolderOption[]
  /** After a successful move — refresh folder counts in parent. */
  onDocumentMoved?: () => void | Promise<void>
  /** Bumped by parent after external moves (e.g. drag-drop on folder card). */
  refreshToken?: number
}

const FILE_HOVER_BG = '#F3EFE9'

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function mimeLabel(mime: string | null, fileName: string): string {
  if (mime?.includes('pdf')) return 'PDF'
  if (mime?.startsWith('image/')) return 'תמונה'
  if (mime?.includes('sheet') || /\.xlsx?$/i.test(fileName)) return 'Excel'
  if (mime?.includes('word') || /\.docx?$/i.test(fileName)) return 'Word'
  if (mime?.includes('zip') || /\.zip$/i.test(fileName)) return 'ZIP'
  const ext = fileName.split('.').pop()
  return ext ? ext.toUpperCase() : 'קובץ'
}

export function ProjectDocumentsPanel({
  projectId = null,
  folderId = null,
  folderName = null,
  moveFolderOptions = [],
  onDocumentMoved,
  refreshToken = 0,
}: Props) {
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [signDoc, setSignDoc] = useState<DocRow | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signerPhone, setSignerPhone] = useState('')
  const [signUrl, setSignUrl] = useState('')
  const [sendVia, setSendVia] = useState<'none' | 'sms' | 'whatsapp'>('whatsapp')
  const [signSending, setSignSending] = useState(false)
  const [isMobile, setIsMobile] = useState(() => getIsMobileViewport())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [movingDocId, setMovingDocId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, signDoc != null)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (folderId) params.set('folder_id', folderId)
      else if (projectId) params.set('project_id', projectId)
      else throw new Error('חסר מזהה תיקיה או פרויקט')
      const res = await fetchWithTimeout(`/api/projects/documents?${params.toString()}`)
      const json = (await res.json()) as { documents?: DocRow[]; error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      setDocs(json.documents ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [folderId, projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (refreshToken === 0) return
    void load()
  }, [refreshToken, load])

  async function onUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      if (folderId) fd.append('folder_id', folderId)
      if (projectId) fd.append('project_id', projectId)
      fd.append('file', file)
      const res = await fetchWithTimeout('/api/projects/documents', {
        method: 'POST',
        body: fd,
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('הקובץ הועלה')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'העלאה נכשלה')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onMoveToFolder(doc: DocRow, targetFolderId: string) {
    if (!targetFolderId || targetFolderId === folderId) return
    setMovingDocId(doc.id)
    try {
      const res = await fetchWithTimeout('/api/projects/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id, folder_id: targetFolderId }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('הקובץ הועבר לתיקיה')
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      await onDocumentMoved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'העברה נכשלה')
    } finally {
      setMovingDocId(null)
    }
  }

  function onDocDragStart(e: React.DragEvent, docId: string) {
    setDraggingId(docId)
    e.dataTransfer.setData(PROJECT_DOCUMENT_DRAG_MIME, docId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDocDragEnd() {
    setDraggingId(null)
  }

  async function onDelete(doc: DocRow) {
    if (!window.confirm(`למחוק את "${doc.file_name}"?`)) return
    try {
      const res = await fetchWithTimeout('/api/projects/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('נמחק')
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'מחיקה נכשלה')
    }
  }

  async function onSendForSign() {
    if (!signDoc) return
    if (!projectId) {
      toast.error('שליחה לחתימה זמינה לתיקיות המשויכות לבניין')
      return
    }
    if (!signUrl.trim()) {
      toast.error('נא להזין קישור לחתימה (DocuSign / Comsign)')
      return
    }
    setSignSending(true)
    try {
      const res = await fetchWithTimeout('/api/documents/sign-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          document_id: signDoc.id,
          document_name: signDoc.file_name,
          signer_name: signerName.trim() || undefined,
          signer_phone: signerPhone.trim() || undefined,
          sign_url: signUrl.trim(),
          send_via: sendVia,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('בקשת חתימה נשלחה')
      setSignDoc(null)
      setSignerName('')
      setSignerPhone('')
      setSignUrl('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSignSending(false)
    }
  }

  const sectionLabel = folderId ? 'קבצים' : 'מסמכים'
  const hint = folderName
    ? `${folderName} · עד 15MB — PDF, תמונות, Office, ZIP`
    : 'עד 15MB — PDF, תמונות, Office, ZIP'

  return (
    <section style={styles.section}>
      <div style={styles.sectionHead}>
        <span style={styles.sectionLabel}>{sectionLabel}</span>
        <div style={styles.sectionLine} />
        <span style={styles.sectionCount}>{loading ? '…' : docs.length}</span>
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onUpload(f)
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          loading={uploading}
          style={{ flexShrink: 0 }}
        >
          העלאת קובץ
        </Button>
      </div>
      <p style={styles.hint}>{hint}</p>

      {loading ? (
        <p style={styles.muted}>טוען...</p>
      ) : docs.length === 0 ? (
        <p style={styles.muted}>
          {folderId ? 'אין מסמכים בתיקיה — העלו קובץ ראשון.' : 'אין מסמכים בפרויקט — העלו קובץ ראשון.'}
        </p>
      ) : (
        <div
          style={{
            ...styles.grid,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
          }}
        >
          {docs.map((doc) => {
            const hovered = hoveredId === doc.id
            return (
              <div
                key={doc.id}
                draggable={!isMobile && moveFolderOptions.length > 0}
                onDragStart={(e) => onDocDragStart(e, doc.id)}
                onDragEnd={onDocDragEnd}
                onMouseEnter={() => setHoveredId(doc.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...styles.card,
                  background: hovered ? FILE_HOVER_BG : theme.colors.surface,
                  borderColor: theme.colors.border,
                  transform: hovered ? 'translateY(-1px)' : 'none',
                  width: isMobile ? '100%' : undefined,
                  opacity: draggingId === doc.id ? 0.55 : 1,
                  cursor: !isMobile && moveFolderOptions.length > 0 ? 'grab' : undefined,
                }}
              >
                <span style={styles.cardName}>{doc.file_name}</span>
                <span style={styles.cardMeta}>
                  {mimeLabel(doc.mime_type, doc.file_name)} · {formatBytes(doc.file_size)}
                </span>
                <span style={styles.cardFooter}>
                  {new Date(doc.created_at).toLocaleDateString('he-IL')}
                </span>
                {isMobile && moveFolderOptions.length > 0 ? (
                  <div style={styles.moveRow}>
                    <span style={styles.moveLabel}>העבר לתיקייה</span>
                    <Select
                      value=""
                      onChange={(targetId) => {
                        if (targetId && movingDocId !== doc.id) void onMoveToFolder(doc, targetId)
                      }}
                      options={[
                        { label: 'בחרו תיקיה…', value: '' },
                        ...moveFolderOptions.map((f) => ({ label: f.label, value: f.id })),
                      ]}
                    />
                  </div>
                ) : null}
                <div style={styles.cardActions}>
                  {doc.download_url ? (
                    <a
                      href={doc.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                    >
                      הורדה
                    </a>
                  ) : null}
                  {projectId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSignDoc(doc)
                        setSignerName('')
                        setSignerPhone('')
                        setSignUrl('')
                      }}
                      style={styles.signBtn}
                    >
                      חתימה
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void onDelete(doc)} style={styles.deleteBtn}>
                    מחק
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {signDoc && (
        <div
          className={isMobile ? 'app-modal-backdrop-mobile' : undefined}
          style={styles.modalBackdrop}
          role="presentation"
          onClick={() => setSignDoc(null)}
        >
          <div
            ref={modalRef}
            className={isMobile ? 'app-modal-sheet-root' : undefined}
            style={isMobile ? styles.modalMobile : styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-doc-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h5 id="sign-doc-title" style={styles.modalTitle}>
              שליחה לחתימה — {signDoc.file_name}
            </h5>
            <div
              className={isMobile ? 'app-modal-sheet-scroll' : undefined}
              style={isMobile ? styles.modalScroll : undefined}
            >
              <label style={styles.modalLabel} htmlFor="sign-url">
                קישור חתימה (DocuSign / Comsign)
              </label>
              <input
                id="sign-url"
                type="url"
                value={signUrl}
                onChange={(e) => setSignUrl(e.target.value)}
                style={styles.modalInput}
                dir="ltr"
                placeholder="https://..."
              />
              <label style={styles.modalLabel} htmlFor="signer-name">
                שם החותם
              </label>
              <input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                style={styles.modalInput}
              />
              <label style={styles.modalLabel} htmlFor="signer-phone">
                טלפון (SMS / WhatsApp)
              </label>
              <input
                id="signer-phone"
                type="tel"
                value={signerPhone}
                onChange={(e) => setSignerPhone(e.target.value)}
                style={styles.modalInput}
                placeholder="05xxxxxxxx"
              />
              <label style={styles.modalLabel} htmlFor="send-via">
                שליחת הקישור
              </label>
              <select
                id="send-via"
                value={sendVia}
                onChange={(e) => setSendVia(e.target.value as typeof sendVia)}
                style={styles.modalInput}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="none">שמירה בלבד (ללא שליחה)</option>
              </select>
            </div>
            <div
              className={isMobile ? 'app-modal-sheet-footer' : undefined}
              style={styles.modalActions}
            >
              <Button variant="secondary" size="sm" onClick={() => setSignDoc(null)}>
                ביטול
              </Button>
              <Button size="sm" loading={signSending} onClick={() => void onSendForSign()}>
                שלח
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
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
  hint: {
    margin: 0,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 1.4,
  },
  muted: { margin: 0, fontSize: 14, color: theme.colors.textMuted },
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
    transition: `background ${theme.motion.fast}, border-color ${theme.motion.fast}, transform ${theme.motion.fast}`,
    fontFamily: 'inherit',
    boxShadow: theme.shadows.xs,
  },
  cardName: {
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.3,
    wordBreak: 'break-word',
  },
  cardMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  cardFooter: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  moveRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 10,
  },
  moveLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  cardActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  link: { fontSize: 13, color: theme.colors.primary, textDecoration: 'none', fontWeight: 600 },
  signBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.primary,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: 0,
    fontFamily: 'inherit',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.error,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: 0,
    fontFamily: 'inherit',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
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
  modalScroll: {
    paddingBottom: 8,
  },
  modalTitle: { margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary },
  modalLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: theme.colors.textSecondary,
  },
  modalInput: {
    width: '100%',
    marginBottom: 12,
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 15,
    boxSizing: 'border-box',
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontFamily: 'inherit',
  },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 },
}
