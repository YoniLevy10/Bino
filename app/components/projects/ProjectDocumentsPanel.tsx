'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, theme } from '../ui'

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
  const fileRef = useRef<HTMLInputElement>(null)

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

  return (
    <div style={styles.box}>
      <div style={styles.header}>
        <h4 style={styles.title}>תיקיית מסמכים</h4>
        <div style={styles.headerActions}>
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
          >
            העלאת קובץ
          </Button>
        </div>
      </div>
      <p style={styles.hint}>חוזים, תוכניות, מסמכים — עד 15MB (PDF, תמונות, Office, ZIP).</p>

      {loading ? (
        <p style={styles.muted}>טוען...</p>
      ) : docs.length === 0 ? (
        <p style={styles.muted}>אין מסמכים בפרויקט</p>
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
                <button type="button" onClick={() => void onDelete(doc)} style={styles.deleteBtn}>
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
  box: {
    marginTop: 20,
    padding: 16,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  headerActions: { display: 'flex', gap: 8 },
  title: { margin: 0, fontSize: 15, fontWeight: 600 },
  hint: { margin: '0 0 12px', fontSize: 12, color: theme.colors.textMuted },
  muted: { margin: 0, fontSize: 13, color: theme.colors.textMuted },
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
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.error,
    cursor: 'pointer',
    fontSize: 13,
  },
}
