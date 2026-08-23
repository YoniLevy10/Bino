import Link from 'next/link'
import { legalTelHref, type LegalSiteConfig } from '@/lib/legal-site-config'

/** Shared Grow-audit landing body (platform or per-tenant merchant). */
export function VaadPayContent({
  cfg,
  termsHref = '/terms',
  privacyHref = '/privacy',
  contactHref = '/contact',
  incompleteHint,
}: {
  cfg: LegalSiteConfig
  termsHref?: string
  privacyHref?: string
  contactHref?: string
  incompleteHint?: string | null
}) {
  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#1e40af' }}>
        {cfg.businessName}
      </p>
      <h1 style={{ margin: '0 0 16px', fontSize: 30, lineHeight: 1.3 }}>
        תשלום דמי ועד וחיובים דיגיטליים
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 16, color: '#334155', lineHeight: 1.65 }}>
        שירות זה מאפשר לדיירים לשלם חיובים (למשל דמי ועד בית) באמצעות קישור תשלום אישי שנשלח ב־SMS.
        לפני המעבר לסליקה מאובטחת מוצג עמוד פרטי המשלם (מייל לאישור תשלום וטלפון אופציונלי) ואישור
        התקנון. הכסף מגיע לבית העסק ששלח את החיוב — לא לפלטפורמת במקור.
      </p>

      {incompleteHint ? (
        <p
          style={{
            padding: 12,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            fontSize: 14,
            color: '#9a3412',
            marginBottom: 20,
          }}
        >
          {incompleteHint}
        </p>
      ) : null}

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
        {cfg.email ? (
          <p style={{ margin: 0 }}>
            מייל:{' '}
            <a href={`mailto:${cfg.email}`} dir="ltr" style={{ color: '#1e40af' }}>
              {cfg.email}
            </a>
          </p>
        ) : null}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>מסמכים</h2>
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <Link href={termsHref} style={{ color: '#1e40af', fontWeight: 600 }}>
            תקנון (כולל ביטולים)
          </Link>
          <Link href={privacyHref} style={{ color: '#1e40af', fontWeight: 600 }}>
            מדיניות פרטיות
          </Link>
          <Link href={contactHref} style={{ color: '#1e40af', fontWeight: 600 }}>
            יצירת קשר
          </Link>
        </p>
      </section>

      <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.55 }}>
        אין סל קניות ציבורי: כל תשלום נפתח מקישור אישי שקיבלתם. אם אין בידכם קישור — פנו לוועד /
        לחברת הניהול.
      </p>
    </>
  )
}
