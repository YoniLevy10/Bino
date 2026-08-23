import type { Metadata } from 'next'
import Link from 'next/link'
import { getLegalSiteConfig, legalTelHref } from '@/lib/legal-site-config'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'

export const metadata: Metadata = {
  title: 'תשלום דמי ועד | במקור',
  description: 'תשלום מאובטח של דמי ועד וחיובים דיגיטליים — במקור',
}

/**
 * Public service page for Grow / clearing website audit.
 * Submit this URL in Morning Digital Payments: /vaad-pay
 */
export default function VaadPayLandingPage() {
  const cfg = getLegalSiteConfig()

  return (
    <LegalPublicShell backHref="/contact" backLabel="יצירת קשר →">
      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#1e40af' }}>
        {cfg.businessName}
      </p>
      <h1 style={{ margin: '0 0 16px', fontSize: 30, lineHeight: 1.3 }}>
        תשלום דמי ועד וחיובים דיגיטליים
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 16, color: '#334155', lineHeight: 1.65 }}>
        שירות זה מאפשר לדיירים לשלם חיובים (למשל דמי ועד בית) באמצעות קישור תשלום אישי שנשלח ב־SMS.
        לפני המעבר לסליקה מאובטחת מוצג עמוד פרטי המשלם (מייל לאישור תשלום וטלפון אופציונלי) ואישור
        התקנון.
      </p>

      <section
        style={{
          padding: 16,
          borderRadius: 12,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>מה נמכר / מה השירות</h2>
        <ul style={{ margin: 0, paddingRight: 20, color: '#334155', lineHeight: 1.7 }}>
          <li>תשלום חיוב ועד בית / גבייה דיגיטלית לפי קישור אישי</li>
          <li>אישור תשלום במייל (כשמוזן מייל בעמוד התשלום)</li>
          <li>סליקה מאובטחת דרך ספק חיצוני (Morning / Grow)</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>יצירת קשר</h2>
        <p style={{ margin: '0 0 6px' }}>
          טלפון:{' '}
          <a href={legalTelHref(cfg.phone)} style={{ color: '#1e40af', fontWeight: 700 }}>
            {cfg.phoneDisplay}
          </a>
        </p>
        <p style={{ margin: '0 0 6px' }}>כתובת: {cfg.address}</p>
        <p style={{ margin: 0 }}>
          מייל:{' '}
          <a href={`mailto:${cfg.email}`} dir="ltr" style={{ color: '#1e40af' }}>
            {cfg.email}
          </a>
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>מסמכים</h2>
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <Link href="/terms" style={{ color: '#1e40af', fontWeight: 600 }}>
            תקנון (כולל ביטולים)
          </Link>
          <Link href="/privacy" style={{ color: '#1e40af', fontWeight: 600 }}>
            מדיניות פרטיות
          </Link>
          <Link href="/contact" style={{ color: '#1e40af', fontWeight: 600 }}>
            יצירת קשר
          </Link>
        </p>
      </section>

      <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.55 }}>
        אין סל קניות ציבורי: כל תשלום נפתח מקישור אישי שקיבלתם. אם אין בידכם קישור — פנו לוועד /
        לחברת הניהול.
      </p>
    </LegalPublicShell>
  )
}
