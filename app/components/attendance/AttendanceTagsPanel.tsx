'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Card, Button, theme } from '../ui'

type TagRow = {
  id: string
  tag_code: string
  tag_type: string
  label: string | null
  is_active: boolean
  scan_url: string
  sticker_installed_at?: string | null
  projects?: { name?: string; project_code?: string } | { name?: string; project_code?: string }[] | null
}

function projectLabel(row: TagRow): string {
  if (row.tag_type === 'office') return 'משרד'
  const p = row.projects
  if (!p) return row.label || '—'
  if (Array.isArray(p)) return p[0]?.name || row.label || '—'
  return p.name || row.label || '—'
}

type Props = {
  /** Bump to reload after dashboard refresh */
  refreshKey?: number
}

/** Manager-facing NFC tag list — copy URL / open QR for verification (tags issued by Bino). */
export function AttendanceTagsPanel({ refreshKey = 0 }: Props) {
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/attendance/tags')
      const body = (await res.json().catch(() => ({}))) as { tags?: TagRow[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'טעינת תגים נכשלה')
      setTags(body.tags ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת תגים נכשלה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('הקישור הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  function qrPreviewUrl(scanUrl: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(scanUrl)}`
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={styles.header}>
        <h3 style={styles.title}>מדבקות NFC / QR</h3>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          רענון
        </Button>
      </div>
      <p style={styles.hint}>
        רשימת התגים שלכם. העתיקו קישור או הציגו QR לבדיקה שהמדבקה מתוכנתת נכון. יצירת תגים חדשים —
        דרך תמיכת Bino.
      </p>

      {loading ? (
        <p style={styles.hint}>טוען…</p>
      ) : tags.length === 0 ? (
        <p style={styles.warn}>
          עדיין אין תגים בחשבון. פנו לתמיכת Bino להפעלת מדבקות — בלי תגים אי אפשר להחתים.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>קוד</th>
                <th style={styles.th}>מיקום</th>
                <th style={styles.th}>הודבק</th>
                <th style={styles.th}>QR</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
                  <td style={styles.td}>
                    <code style={styles.code}>{t.tag_code}</code>
                  </td>
                  <td style={styles.td}>{projectLabel(t)}</td>
                  <td style={styles.td}>{t.sticker_installed_at ? 'כן' : 'לא'}</td>
                  <td style={styles.td}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrPreviewUrl(t.scan_url)}
                      alt={`QR ${t.tag_code}`}
                      width={56}
                      height={56}
                      style={{ display: 'block', borderRadius: 4 }}
                    />
                  </td>
                  <td style={styles.td}>
                    <Button variant="secondary" size="sm" onClick={() => void copyUrl(t.scan_url)}>
                      העתק קישור
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600 },
  hint: { margin: '0 0 12px', fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.5 },
  warn: {
    margin: 0,
    fontSize: 14,
    color: theme.colors.warning,
    fontWeight: 600,
    lineHeight: 1.5,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'right',
    padding: '8px 10px',
    borderBottom: `1px solid ${theme.colors.border}`,
    color: theme.colors.textSecondary,
    fontWeight: 600,
  },
  td: {
    padding: '10px',
    borderBottom: `1px solid ${theme.colors.border}`,
    verticalAlign: 'middle',
  },
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 13,
    background: theme.colors.muted,
    padding: '2px 6px',
    borderRadius: 4,
  },
}
