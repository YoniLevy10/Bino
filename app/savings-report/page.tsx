import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'דוח חיסכון תפעולי — BINO',
  description: 'דוגמה להוכחת חיסכון במדדי BINO מול לפני המערכת',
  robots: { index: false, follow: false },
}

const WA_URL =
  'https://wa.me/972548102688?text=' +
  encodeURIComponent('שלום, ראיתי את דוח החיסכון של BINO ואשמח לדמו קצר')

const ROWS = [
  {
    metric: 'זמן עד שיוך',
    before: 'שעות עד ימים',
    after: 'דקות עם המלצה אוטומטית',
    sample: '↓ ~70%',
  },
  {
    metric: 'זמן עד פתרון',
    before: 'תלוי בזיכרון של המנהל',
    after: 'מסלול ידוע לפי היסטוריית הבניין',
    sample: '↓ ~40%',
  },
  {
    metric: 'שיעור תקלות חוזרות',
    before: 'בלי זיהוי שיטתי',
    after: 'התראה על דפוסים חוזרים',
    sample: '↓ ניכר',
  },
  {
    metric: 'עלות תחזוקה לבניין',
    before: 'אקסל מפוזר',
    after: 'עלות שקופה לכל בניין',
    sample: 'שקיפות מלאה',
  },
  {
    metric: '% תקלות בלי התערבות מנהל',
    before: 'נמוך — הכל עובר דרך מנהל',
    after: 'שיוך אוטומטי + SLA',
    sample: '↑ יעד מוצרי',
  },
] as const

export default function SavingsReportPage() {
  return (
    <main
      dir="rtl"
      lang="he"
      style={{
        minHeight: '100vh',
        background: '#fff',
        color: '#0f172a',
        fontFamily: 'var(--font-heebo), Heebo, Arial, sans-serif',
        padding: '32px 20px 64px',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            letterSpacing: '0.12em',
            color: '#0066FF',
            fontWeight: 700,
          }}
        >
          BINO
        </p>
        <h1 style={{ margin: '8px 0 6px', fontSize: 28, lineHeight: 1.25 }}>
          דוח חיסכון תפעולי
        </h1>
        <p style={{ margin: '0 0 8px', color: '#475569', fontSize: 15 }}>
          הוכחה לחברת הניהול: כמה זמן וכסף נחסכים כשיש זיכרון תפעולי חכם לבניין — לא עוד מערכת
          תקלות בלבד.
        </p>
        <p
          style={{
            margin: '0 0 24px',
            display: 'inline-block',
            background: '#FEF3C7',
            color: '#92400E',
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 10px',
            borderRadius: 8,
          }}
        >
          מספרים לדוגמה בלבד — עד קיים case study עם הסכמת לקוח משלם
        </p>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 14,
            marginBottom: 28,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '2px solid #0f172a', textAlign: 'right' }}>
              <th style={{ padding: '10px 8px' }}>מדד</th>
              <th style={{ padding: '10px 8px' }}>לפני BINO</th>
              <th style={{ padding: '10px 8px' }}>עם BINO</th>
              <th style={{ padding: '10px 8px' }}>דוגמה</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.metric} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px 8px', fontWeight: 600 }}>{row.metric}</td>
                <td style={{ padding: '12px 8px', color: '#64748b' }}>{row.before}</td>
                <td style={{ padding: '12px 8px' }}>{row.after}</td>
                <td style={{ padding: '12px 8px', color: '#0066FF', fontWeight: 600 }}>
                  {row.sample}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: '#0066FF',
              color: '#fff',
              textDecoration: 'none',
              padding: '12px 18px',
              borderRadius: 12,
              fontWeight: 600,
            }}
          >
            לתיאום הדגמה בוואטסאפ
          </a>
          <Link href="/" style={{ color: '#0066FF', fontWeight: 600 }}>
            חזרה לדף BINO
          </Link>
        </div>
        <p style={{ marginTop: 20, fontSize: 12, color: '#94a3b8' }}>
          להדפסה: Ctrl/Cmd+P · מתאים כחד־עמוד לשיחת דמו
        </p>
      </div>
    </main>
  )
}
