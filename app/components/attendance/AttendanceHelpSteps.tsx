'use client'

import { type CSSProperties } from 'react'
import { Card, theme } from '../ui'

const STEPS = [
  {
    n: '1',
    title: 'שלחו לכל עובד קישור אישי',
    body: 'ממסך «עובדים» — כל עובד פותח את הקישור פעם אחת כשיש Wi‑Fi בטלפון.',
  },
  {
    n: '2',
    title: 'הדביקו מדבקות NFC',
    body: 'מדבקה בכניסה למשרד + מדבקה בכל בניין. העובד מצמיד את הטלפון — זה הכל.',
  },
  {
    n: '3',
    title: 'צפו בשעות כאן',
    body: 'הדוח מתעדכן אוטומטית. אפשר להוריד Excel לחשבות בסוף החודש.',
  },
]

export function AttendanceHelpSteps() {
  return (
    <Card style={{ marginBottom: 16, background: theme.colors.primaryMuted, border: 'none' }}>
      <h3 style={styles.title}>איך זה עובד?</h3>
      <div style={styles.grid}>
        {STEPS.map((s) => (
          <div key={s.n} style={styles.step}>
            <div style={styles.num}>{s.n}</div>
            <div>
              <div style={styles.stepTitle}>{s.title}</div>
              <div style={styles.stepBody}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={styles.videoHint}>
        <a
          href="https://www.youtube.com/results?search_query=NFC+tag+write+url+hebrew"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.videoLink}
        >
          צפו בסרטון הדרכה (YouTube)
        </a>
        {' · '}
        <a href="/attendance/worker-guide" target="_blank" rel="noopener noreferrer" style={styles.videoLink}>
          הדפיסו הוראות לעובדים
        </a>
      </p>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: theme.colors.textPrimary },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 14,
  },
  step: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  num: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: theme.colors.primary,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    flexShrink: 0,
  },
  stepTitle: { fontWeight: 600, fontSize: 14, marginBottom: 4, color: theme.colors.textPrimary },
  stepBody: { fontSize: 13, lineHeight: 1.45, color: theme.colors.textPrimary },
  videoHint: { margin: '14px 0 0', fontSize: 13, color: theme.colors.textMuted },
  videoLink: { color: theme.colors.primary, fontWeight: 600 },
}
