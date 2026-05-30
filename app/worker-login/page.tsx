'use client'

import type { CSSProperties } from 'react'

export default function WorkerLoginPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>אזור אישי לעובדי שטח</h1>
        <p style={styles.subtitle}>
          כאן רואים את התקלות שמשויכות אליכם, מעדכנים סטטוס ושולחים הודעות — בלי כניסה עם Google.
        </p>
        <p style={styles.note}>
          הכניסה מתבצעת דרך <strong>קישור אישי</strong> (WhatsApp / SMS) מהמשרד. אחרי פתיחה ראשונה — שמרו את הדף במסך הבית.
        </p>
        <p style={styles.noteMuted}>
          כניסה באימייל בלבד אינה פעילה מטעמי אבטחה.
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F8FAFC',
    padding: '24px',
    direction: 'rtl',
    fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
  },
  card: {
    background: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid #E2E8F0',
    padding: '40px 36px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#0F172A',
    margin: '0 0 16px 0',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '15px',
    color: '#334155',
    textAlign: 'center',
    margin: '0 0 20px 0',
    lineHeight: 1.65,
  },
  note: {
    fontSize: '14px',
    color: '#64748B',
    textAlign: 'center',
    margin: '0 0 12px 0',
    lineHeight: 1.6,
  },
  noteMuted: {
    fontSize: '13px',
    color: '#94A3B8',
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.5,
  },
}
