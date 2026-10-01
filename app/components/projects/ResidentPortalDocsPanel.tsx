'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { Button, theme } from '../ui'

type PortalDoc = {
  id: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  published_at: string | null
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

/**
 * Manager UI: upload a designed PDF that residents see under «מידע הבניין».
 * Separate from the paid internal document archive.
 */
export function ResidentPortalDocsPanel({ projectId }: Props) {
  const [docs, setDocs] = useState<PortalDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout(
        `/api/projects/resident-portal/documents?project_id=${encodeURIComponent(projectId)}`
      )
      const json = (await res.json()) as { documents?: PortalDoc[]; error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      setDocs(json.documents ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת מסמכי הדיירים נכשלה')
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function onUpload(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast.error('יש להעלות קובץ PDF בלבד')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('project_id', projectId)
      fd.append('file', file)
      const res = await fetchWithTimeout('/api/projects/resident-portal/documents', {
        method: 'POST',
        body: fd,
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('הקובץ פורסם לפורטל הדיירים')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'העלאה נכשלה')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onUnpublish(doc: PortalDoc) {
    setBusyId(doc.id)
    try {
      const res = await fetchWithTimeout('/api/projects/resident-portal/documents/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id, publish: false }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('הוסר מפורטל הדיירים')
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הסרה נכשלה')
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(doc: PortalDoc) {
    if (!window.confirm(`למחוק את "${doc.file_name}" לצמיתות?\nהקובץ ייעלם גם מפורטל הדיירים.`)) {
      return
    }
    setBusyId(doc.id)
    try {
      const res = await fetchWithTimeout('/api/projects/resident-portal/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('המסמך נמחק')
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'מחיקה נכשלה')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={styles.wrap}>
      <p style={styles.help}>
        העלו PDF מעוצב (שעות בריכה/כושר, הודעת ועד, נוהל…) — הדיירים יראו אותו באזור האישי תחת
        «מידע הבניין».
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onUpload(f)
        }}
      />
      <Button
        variant="primary"
        onClick={() => fileRef.current?.click()}
        loading={uploading}
        style={{ width: '100%' }}
      >
        העלאת PDF לפורטל דיירים
      </Button>

      {loading ? (
        <p style={styles.muted}>טוען מסמכים שפורסמו…</p>
      ) : docs.length === 0 ? (
        <p style={styles.muted}>עדיין אין מסמכים שפורסמו לדיירים בבניין זה.</p>
      ) : (
        <ul style={styles.list}>
          {docs.map((doc) => (
            <li key={doc.id} style={styles.item}>
              <div style={styles.itemMain}>
                <span style={styles.fileName}>{doc.file_name}</span>
                <span style={styles.meta}>
                  {formatBytes(doc.file_size)}
                  {doc.published_at
                    ? ` · פורסם ${new Date(doc.published_at).toLocaleDateString('he-IL')}`
                    : ''}
                </span>
                <span style={styles.badge}>גלוי לדיירים</span>
              </div>
              <div style={styles.itemActions}>
                {doc.download_url ? (
                  <a
                    href={doc.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.link}
                  >
                    צפייה
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === doc.id}
                  onClick={() => void onUnpublish(doc)}
                  style={styles.secondaryBtn}
                >
                  הסרה מהפורטל
                </button>
                <button
                  type="button"
                  disabled={busyId === doc.id}
                  onClick={() => void onDelete(doc)}
                  style={styles.deleteBtn}
                >
                  מחק
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'grid',
    gap: 12,
  },
  help: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.45,
    color: theme.colors.textSecondary,
  },
  muted: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 0',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  itemMain: {
    minWidth: 0,
    display: 'grid',
    gap: 4,
  },
  fileName: {
    fontWeight: 600,
    fontSize: 14,
    color: theme.colors.textPrimary,
    wordBreak: 'break-word',
  },
  meta: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  badge: {
    display: 'inline-block',
    width: 'fit-content',
    fontSize: 11,
    fontWeight: 600,
    color: theme.colors.success,
    background: theme.colors.successMuted,
    padding: '2px 8px',
    borderRadius: 6,
  },
  itemActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  link: {
    fontSize: 13,
    color: theme.colors.primary,
    textDecoration: 'none',
    fontWeight: 600,
  },
  secondaryBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.primary,
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    fontFamily: 'inherit',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.error,
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    fontFamily: 'inherit',
  },
}
