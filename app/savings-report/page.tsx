import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'דוח חיסכון תפעולי — BINO',
  description:
    'דוח חיסכון לדוגמה: מדדי הכוכב הצפוני של BINO מול לפני המערכת. מספרים לדוגמה בלבד.',
  robots: { index: false, follow: false },
}

const WA_URL =
  'https://wa.me/972548102688?text=' +
  encodeURIComponent('שלום, ראיתי את דוח החיסכון של BINO ואשמח לשיחה קצרה')

type MetricRow = {
  name: string
  before: string
  after: string
  note: string
}

/** SAMPLE / demo numbers only — clearly labeled in the UI as דוגמה */
const SAMPLE_METRICS: MetricRow[] = [
  {
    name: 'זמן עד שיוך',
    before: '48 דק׳',
    after: '12 דק׳',
    note: 'ירידה של ~75%',
  },
  {
    name: 'זמן עד פתרון',
    before: '36 שעות',
    after: '14 שעות',
    note: 'ירידה של ~61%',
  },
  {
    name: 'שיעור תקלות חוזרות',
    before: '28%',
    after: '11%',
    note: 'פחות כשלים חוזרים',
  },
  {
    name: 'עלות תחזוקה לבניין',
    before: '₪4,800 / חודש',
    after: '₪3,100 / חודש',
    note: 'חיסכון ~₪1,700 לבניין',
  },
  {
    name: 'אחוז התקלות שטופלו ללא התערבות מנהל',
    before: '22%',
    after: '67%',
    note: 'פחות עומס על המנהל',
  },
]

export default function SavingsReportPage() {
  return (
    <div className="savings-report" lang="he" dir="rtl">
      <style>{`
        .savings-report {
          --ink: #0f172a;
          --muted: #475569;
          --line: #cbd5e1;
          --accent: #0f766e;
          --warn-bg: #fffbeb;
          --warn-border: #f59e0b;
          --warn-ink: #92400e;
          min-height: 100vh;
          background: #fff;
          color: var(--ink);
          font-family: var(--font-heebo), "Heebo", "Segoe UI", Tahoma, Arial, sans-serif;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .savings-report * { box-sizing: border-box; }
        .savings-report .page {
          max-width: 800px;
          margin: 0 auto;
          padding: 32px 28px 48px;
        }
        .savings-report .brand {
          font-size: 13px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent);
          font-weight: 700;
          margin: 0 0 8px;
        }
        .savings-report h1 {
          margin: 0 0 10px;
          font-size: 28px;
          font-weight: 800;
          line-height: 1.25;
        }
        .savings-report .lede {
          margin: 0 0 20px;
          color: var(--muted);
          font-size: 15px;
          max-width: 38em;
        }
        .savings-report .sample-banner {
          padding: 12px 14px;
          margin: 0 0 24px;
          background: var(--warn-bg);
          border: 1px solid var(--warn-border);
          border-radius: 8px;
          color: var(--warn-ink);
          font-size: 14px;
          font-weight: 600;
        }
        .savings-report .sample-banner strong { font-weight: 800; }
        .savings-report table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          margin: 0 0 28px;
        }
        .savings-report th,
        .savings-report td {
          border: 1px solid var(--line);
          padding: 10px 12px;
          text-align: right;
          vertical-align: top;
        }
        .savings-report th {
          background: #f8fafc;
          font-weight: 700;
          font-size: 13px;
        }
        .savings-report td.metric-name { font-weight: 700; width: 32%; }
        .savings-report td.num {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .savings-report td.note { color: var(--muted); font-size: 13px; }
        .savings-report .sample-tag {
          display: inline-block;
          margin-inline-start: 6px;
          padding: 1px 6px;
          border-radius: 4px;
          background: #fef3c7;
          color: var(--warn-ink);
          font-size: 11px;
          font-weight: 800;
          vertical-align: middle;
        }
        .savings-report .footer-cta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-top: 8px;
          padding-top: 20px;
          border-top: 1px solid var(--line);
        }
        .savings-report .btn-wa {
          display: inline-block;
          padding: 10px 18px;
          background: #128c7e;
          color: #fff !important;
          text-decoration: none;
          font-weight: 700;
          border-radius: 8px;
          font-size: 15px;
        }
        .savings-report .btn-home {
          color: var(--accent);
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
        }
        .savings-report .print-hint {
          margin: 16px 0 0;
          font-size: 12px;
          color: var(--muted);
        }
        @media print {
          .savings-report { background: #fff; min-height: 0; }
          .savings-report .page { padding: 0; max-width: none; }
          .savings-report .no-print { display: none !important; }
          .savings-report .btn-wa { border: 1px solid #128c7e; }
          .savings-report a { color: inherit; text-decoration: none; }
        }
        @page { margin: 16mm; }
      `}</style>

      <main className="page">
        <p className="brand">BINO</p>
        <h1>דוח חיסכון תפעולי — BINO</h1>
        <p className="lede">
          השוואת מדדי הכוכב הצפוני מול מצב ״לפני BINO״. המספרים למטה הם{' '}
          <strong>דוגמה להמחשה בלבד</strong> — לא נתוני לקוח אמיתי.
        </p>

        <div className="sample-banner" role="note">
          <strong>דוגמה / SAMPLE</strong> — הנתונים בטבלה אינם מדידה מלקוח ספציפי.
          משמשים להמחשת כיוון החיסכון בשיחת מכירה.
        </div>

        <table>
          <thead>
            <tr>
              <th scope="col">מדד</th>
              <th scope="col">לפני BINO</th>
              <th scope="col">עם BINO</th>
              <th scope="col">השפעה</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_METRICS.map((row) => (
              <tr key={row.name}>
                <td className="metric-name">
                  {row.name}
                  <span className="sample-tag">דוגמה</span>
                </td>
                <td className="num">{row.before}</td>
                <td className="num">{row.after}</td>
                <td className="note">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="lede" style={{ marginBottom: 8 }}>
          BINO בונה זיכרון תפעולי לכל בניין: לומדת מהיסטוריה, ממליצה על עובד/ספק, מזהה תקלות
          חוזרות ומוכיחה לחברת הניהול כמה זמן וכסף נחסכו.
        </p>

        <div className="footer-cta">
          <a className="btn-wa" href={WA_URL} target="_blank" rel="noopener noreferrer">
            לתיאום שיחה בוואטסאפ · 054-810-2688
          </a>
          <Link className="btn-home no-print" href="/">
            ← חזרה לדף הבית
          </Link>
        </div>

        <p className="print-hint no-print">להדפסה: Ctrl/Cmd+P · רקע לבן, מותאם ל-RTL.</p>
      </main>
    </div>
  )
}
