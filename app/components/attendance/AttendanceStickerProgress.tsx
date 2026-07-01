'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Card, theme } from '../ui'

type Props = {
  onProgress?: (installed: number, total: number) => void
  installed?: number
  total?: number
}

export function AttendanceStickerProgress({ onProgress, installed: extInstalled, total: extTotal }: Props) {
  const [installed, setInstalled] = useState(extInstalled ?? 0)
  const [total, setTotal] = useState(extTotal ?? 0)

  useEffect(() => {
    if (extInstalled !== undefined && extTotal !== undefined) {
      setInstalled(extInstalled)
      setTotal(extTotal)
      onProgress?.(extInstalled, extTotal)
      return
    }
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/attendance/sticker-progress')
        if (res.ok) {
          const body = (await res.json()) as { installed?: number; total?: number }
          const i = body.installed ?? 0
          const t = body.total ?? 0
          setInstalled(i)
          setTotal(t)
          onProgress?.(i, t)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [onProgress, extInstalled, extTotal])

  if (total === 0) return null

  const pct = Math.round((installed / total) * 100)

  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={styles.title}>מדבקות NFC</h3>
      <p style={styles.hint}>
        {installed} מתוך {total} מדבקות הודבקו ({pct}%)
      </p>
      <div style={styles.barWrap}>
        <div style={{ ...styles.barFill, width: `${pct}%` }} />
      </div>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: '0 0 8px', fontSize: 16, fontWeight: 600 },
  hint: { margin: '0 0 10px', fontSize: 14, color: theme.colors.textMuted },
  barWrap: { height: 8, borderRadius: 999, background: theme.colors.border, overflow: 'hidden' },
  barFill: { height: '100%', background: theme.colors.primary, borderRadius: 999 },
}
