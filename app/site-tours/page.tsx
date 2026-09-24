'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  AppShell,
  Card,
  LoadingSpinner,
  MobileHeader,
  PageHeader,
  theme,
  useMobileMenu,
} from '../components/ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'

type TourRow = {
  id: string
  completed_at: string
  notes: string | null
  defect_ticket_id: string | null
  project_name: string
  project_address: string | null
  worker_name: string
  photos?: { public_url: string; mime_type: string | null }[]
}

export default function SiteToursPage() {
  const [loading, setLoading] = useState(true)
  const [tours, setTours] = useState<TourRow[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const { openMenu } = useMobileMenu()

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/site-tours')
      if (!res.ok) {
        toast.error('טעינת סיורים נכשלה')
        return
      }
      const json = (await res.json()) as { tours?: TourRow[] }
      setTours(json.tours || [])
    } catch {
      toast.error('שגיאת חיבור')
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
          title="סיורים"
          subtitle="היסטוריה מהשטח"
          onMenuClick={openMenu}
        />
      )}
      <div style={styles.wrap(isMobile)}>
        {!isMobile && (
          <PageHeader title="סיורים" subtitle="היסטוריית סיורים, הערות, תמונות וממצאים מהשטח" />
        )}
        {loading ? (
          <LoadingSpinner />
        ) : tours.length === 0 ? (
          <p style={styles.empty}>אין סיורים בחודשיים האחרונים</p>
        ) : (
          <div style={styles.list}>
            {tours.map((t) => (
              <Card key={t.id}>
                <div style={styles.title}>{t.project_name}</div>
                <div style={styles.meta}>
                  {t.worker_name} · {new Date(t.completed_at).toLocaleString('he-IL')}
                  {t.project_address ? ` · ${t.project_address}` : ''}
                </div>
                {t.notes ? <p style={styles.notes}>{t.notes}</p> : null}
                {t.photos && t.photos.length > 0 ? (
                  <div style={styles.photos}>
                    {t.photos.map((ph, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${t.id}-${idx}`}
                        src={ph.public_url}
                        alt=""
                        style={styles.thumb}
                      />
                    ))}
                  </div>
                ) : null}
                {t.defect_ticket_id ? (
                  <a href={`/tickets?ticket=${t.defect_ticket_id}`} style={styles.link}>
                    תקלת ליקוי מהסיור
                  </a>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

const styles = {
  wrap: (mobile: boolean): CSSProperties => ({
    padding: mobile ? '16px 16px 32px' : '32px 40px',
    maxWidth: mobile ? '100%' : 900,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  }),
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10, minWidth: 0 },
  title: { fontWeight: 800, wordBreak: 'break-word' as const },
  meta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    wordBreak: 'break-word' as const,
    lineHeight: 1.4,
  },
  notes: {
    margin: '8px 0 0',
    fontSize: 14,
    lineHeight: 1.45,
    wordBreak: 'break-word' as const,
  },
  photos: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 8 },
  thumb: { width: 72, height: 72, objectFit: 'cover' as const, borderRadius: 8 },
  link: {
    display: 'inline-block',
    marginTop: 8,
    color: theme.colors.primary,
    fontWeight: 700,
  },
  empty: { textAlign: 'center' as const, color: theme.colors.textSecondary },
}
