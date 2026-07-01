'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import {
  AppShell,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  Card,
  LoadingSpinner,
  theme,
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'

type FailedRow = {
  id: string
  channel: string
  destination: string | null
  error_message: string | null
  created_at: string
}

export default function FailedNotificationsPage() {
  const { openMenu } = useMobileMenu()
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<FailedRow[]>([])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/failed-notifications')
      const json = (await res?.json().catch(() => ({}))) as { items?: FailedRow[]; error?: string }
      if (!res?.ok) throw new Error(json.error || 'טעינה נכשלה')
      setItems(json.items ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="כשלי הודעות"
          subtitle={`${items.length} רשומות`}
          onMenuClick={openMenu}
        />
      )}

      <div style={styles.content}>
        {!isMobile && (
          <PageHeader title="כשלי SMS / WhatsApp" subtitle="הודעות שנכשלו אחרי כל ניסיונות השליחה" />
        )}

        {loading ? (
          <div style={styles.center}>
            <LoadingSpinner size="lg" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <p style={styles.empty}>אין כשלונות אחרונים — מצוין.</p>
          </Card>
        ) : (
          <div style={styles.list}>
            {items.map((row) => (
              <Card key={row.id}>
                <div style={styles.rowTop}>
                  <span style={styles.channel}>{row.channel}</span>
                  <span style={styles.date}>
                    {new Date(row.created_at).toLocaleString('he-IL')}
                  </span>
                </div>
                {row.destination && (
                  <p style={styles.dest}>יעד: {row.destination}</p>
                )}
                <p style={styles.err}>{row.error_message || '—'}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: { padding: '24px 32px', maxWidth: '900px', margin: '0 auto' },
  center: { display: 'flex', justifyContent: 'center', padding: '48px' },
  empty: { margin: 0, color: theme.colors.textMuted, fontSize: '15px' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' },
  channel: { fontWeight: 600, color: theme.colors.textPrimary },
  date: { fontSize: '13px', color: theme.colors.textMuted },
  dest: { margin: '0 0 6px', fontSize: '14px', color: theme.colors.textSecondary },
  err: { margin: 0, fontSize: '13px', color: theme.colors.error, wordBreak: 'break-word' },
}
