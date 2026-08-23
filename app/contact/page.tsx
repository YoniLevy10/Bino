import type { Metadata } from 'next'
import Link from 'next/link'
import { getLegalSiteConfig, legalTelHref } from '@/lib/legal-site-config'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'

export const metadata: Metadata = {
  title: 'יצירת קשר | במקור',
  description: 'טלפון, כתובת ומייל ליצירת קשר — במקור',
}

export default function ContactPage() {
  const cfg = getLegalSiteConfig()

  return (
    <LegalPublicShell backHref="/vaad-pay" backLabel="← חזרה לעמוד השירות">
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>יצירת קשר</h1>
      <p style={{ margin: '0 0 24px', color: '#475569', fontSize: 15 }}>
        פרטי בית העסק לצורך שירות תשלומים ותמיכה. פרטים אלה נדרשים גם לאישור ספקי סליקה.
      </p>

      {!cfg.readyForGrowAudit ? (
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
          חסרים טלפון ו/או כתובת בהגדרות השרת (`LEGAL_PHONE`, `LEGAL_ADDRESS`). יש להשלים ב־Vercel לפני
          הגשה ל־Grow.
        </p>
      ) : null}

      <dl style={{ margin: 0, fontSize: 16, lineHeight: 1.8 }}>
        <dt style={{ fontWeight: 700, color: '#64748b', fontSize: 13 }}>שם העסק</dt>
        <dd style={{ margin: '0 0 16px' }}>{cfg.businessName}</dd>

        <dt style={{ fontWeight: 700, color: '#64748b', fontSize: 13 }}>טלפון</dt>
        <dd style={{ margin: '0 0 16px' }}>
          <a href={legalTelHref(cfg.phone)} style={{ color: '#1e40af', fontWeight: 700 }}>
            {cfg.phoneDisplay}
          </a>
        </dd>

        <dt style={{ fontWeight: 700, color: '#64748b', fontSize: 13 }}>כתובת בית העסק</dt>
        <dd style={{ margin: '0 0 16px' }}>{cfg.address}</dd>

        <dt style={{ fontWeight: 700, color: '#64748b', fontSize: 13 }}>מייל</dt>
        <dd style={{ margin: '0 0 16px' }}>
          <a href={`mailto:${cfg.email}`} style={{ color: '#1e40af', fontWeight: 600 }} dir="ltr">
            {cfg.email}
          </a>
        </dd>
      </dl>

      <p style={{ marginTop: 28, fontSize: 14 }}>
        <Link href="/terms" style={{ color: '#1e40af', marginLeft: 12 }}>
          תקנון
        </Link>
        <Link href="/privacy" style={{ color: '#1e40af' }}>
          מדיניות פרטיות
        </Link>
      </p>
    </LegalPublicShell>
  )
}
