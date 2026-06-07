'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, Card, theme } from '../ui'
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

type Props = {
  projectId: string
}

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function ProjectDocumentsPanel({ projectId }: Props) {
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [signDoc, setSignDoc] = useState<DocRow | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signerPhone, setSignerPhone] = useState('')
  const [signUrl, setSignUrl] = useState('')
  const [sendVia, setSendVia] = useState<'none' | 'sms' | 'whatsapp'>('whatsapp')
  const [signSending, setSignSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, signDoc != null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout(
        `/api/projects/documents?project_id=${encodeURIComponent(projectId)}`
      )
      const json = await res.json() as { documents?: DocRow[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setDocs(json.documents ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function onUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('project_id', projectId)
      fd.append('file', file)
      const res = await fetchWithTimeout('/api/projects/documents', {
        method: 'POST',
        body: fd,
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      toast.success('הקובץ הועלה')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'העלאה נכשלה')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onDelete(doc: DocRow) {
    if (!window.confirm(`למחוק את "${doc.file_name}"?`)) return
    try {
      const res = await fetchWithTimeout('/api/projects/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      toast.success('נמחק')
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'מחיקה נכשלה')
    }
  }

  async function onSendForSign() {
    if (!signDoc) return
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
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
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

  return (
    <Card
      title="תיקיית מסמכים"
      subtitle="חוזים, תוכניות, מסמכים — עד 15MB (PDF, תמונות, Office, ZIP)"
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onUpload(f)
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            העלאת קובץ
          </Button>
        </>
      }
    >
      {loading ? (
        <p style={styles.muted}>טוען...</p>
      ) : docs.length === 0 ? (
        <p style={styles.muted}>אין מסמכים בפרויקט — העלו קובץ ראשון.</p>
      ) : (
        <ul style={styles.list}>
          {docs.map((doc) => (
            <li key={doc.id} style={styles.item}>
              <div style={styles.itemMain}>
                <span style={styles.fileName}>{doc.file_name}</span>
                <span style={styles.meta}>
                  {formatBytes(doc.file_size)} ·{' '}
                  {new Date(doc.created_at).toLocaleDateString('he-IL')}
                </span>
              </div>
              <div style={styles.itemActions}>
                {doc.download_url && (
                  <a href={doc.download_url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                    הורדה
                  </a>
                )}
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
                  שליחה לחתימה
                </button>
                <button type="button" onClick={() => void onDelete(doc)} style={styles.deleteBtn}>
                  מחק
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {signDoc && (
        <div style={styles.modalBackdrop} role="presentation">
          <div ref={modalRef} style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="sign-doc-title">
            <h5 id="sign-doc-title" style={styles.modalTitle}>
              שליחה לחתימה — {signDoc.file_name}
            </h5>
            <label style={styles.modalLabel} htmlFor="sign-url">קישור חתימה (DocuSign / Comsign)</label>
            <input
              id="sign-url"
              type="url"
              value={signUrl}
              onChange={(e) => setSignUrl(e.target.value)}
              style={styles.modalInput}
              dir="ltr"
              placeholder="https://..."
            />
            <label style={styles.modalLabel} htmlFor="signer-name">שם החותם</label>
            <input
              id="signer-name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              style={styles.modalInput}
            />
            <label style={styles.modalLabel} htmlFor="signer-phone">טלפון (SMS / WhatsApp)</label>
            <input
              id="signer-phone"
              type="tel"
              value={signerPhone}
              onChange={(e) => setSignerPhone(e.target.value)}
              style={styles.modalInput}
              placeholder="05xxxxxxxx"
            />
            <label style={styles.modalLabel} htmlFor="send-via">שליחת הקישור</label>
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
            <div style={styles.modalActions}>
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
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  muted: { margin: 0, fontSize: 14, color: theme.colors.textMuted },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  itemMain: { flex: 1, minWidth: 0 },
  fileName: { display: 'block', fontWeight: 600, fontSize: 14, wordBreak: 'break-all' },
  meta: { fontSize: 11, color: theme.colors.textMuted },
  itemActions: { display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 },
  link: { fontSize: 13, color: theme.colors.primary, textDecoration: 'none' },
  signBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.primary,
    cursor: 'pointer',
    fontSize: 13,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.error,
    cursor: 'pointer',
    fontSize: 13,
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
    borderRadius: theme.radius.lg,
    padding: 20,
    maxWidth: 420,
    width: '100%',
    border: `1px solid ${theme.colors.border}`,
  },
  modalTitle: { margin: '0 0 12px', fontSize: 15, fontWeight: 600 },
  modalLabel: { display: 'block', fontSize: 12, marginBottom: 4, color: theme.colors.textMuted },
  modalInput: {
    width: '100%',
    marginBottom: 12,
    padding: '8px 10px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    boxSizing: 'border-box',
  },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 },
}
