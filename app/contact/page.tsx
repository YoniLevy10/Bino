import type { Metadata } from 'next'
import Link from 'next/link'
import { getLegalSiteConfig, legalTelHref } from '@/lib/legal-site-config'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { MarketingAnalytics } from '@/app/components/marketing/MarketingAnalytics'
import { MarketingLeadLink } from '@/app/components/marketing/MarketingLeadLink'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'
import '@/app/components/legal/legal-contact.css'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: 'יצירת קשר',
  description:
    'טלפון, כתובת ומייל ליצירת קשר עם BINO — זיכרון תפעולי לניהול פרויקטים, בניינים ושטחים.',
  alternates: { canonical: `${origin}/contact` },
  openGraph: {
    title: 'יצירת קשר | BINO',
    description: 'פרטי קשר לתיאום הדגמה ותמיכה — BINO',
    url: `${origin}/contact`,
    locale: 'he_IL',
  },
  robots: { index: true, follow: true },
}

export default function ContactPage() {
  const cfg = getLegalSiteConfig()

  return (
    <>
      <MarketingAnalytics pagePath="/contact" />
      <LegalPublicShell backHref="/" backLabel="← חזרה לדף הבית">
        <h1 className="legal-contact__h1">יצירת קשר</h1>
        <p className="legal-contact__intro">
          פרטי בית העסק לצורך שירות תשלומים ותמיכה. לתיאום הדגמה לחברות ניהול — השאירו פרטים בטלפון או
          במייל.
        </p>

        {!cfg.readyForGrowAudit ? (
          <p className="legal-contact__warn">
            חסרים טלפון ו/או כתובת בהגדרות השרת (`LEGAL_PHONE`, `LEGAL_ADDRESS`). יש להשלים ב־Vercel לפני
            הגשה ל־Grow.
          </p>
        ) : null}

        <dl className="legal-contact__dl">
          <dt className="legal-contact__dt">שם העסק</dt>
          <dd className="legal-contact__dd">{cfg.businessName}</dd>

          <dt className="legal-contact__dt">טלפון</dt>
          <dd className="legal-contact__dd">
            <MarketingLeadLink
              href={legalTelHref(cfg.phone)}
              method="contact_phone"
              placement="contact"
              className="legal-contact__link"
            >
              {cfg.phoneDisplay}
            </MarketingLeadLink>
          </dd>

          <dt className="legal-contact__dt">כתובת בית העסק</dt>
          <dd className="legal-contact__dd">{cfg.address}</dd>

          <dt className="legal-contact__dt">מייל</dt>
          <dd className="legal-contact__dd">
            {cfg.email ? (
              <MarketingLeadLink
                href={`mailto:${cfg.email}`}
                method="contact_email"
                placement="contact"
                className="legal-contact__link legal-contact__link--email"
                dir="ltr"
              >
                {cfg.email}
              </MarketingLeadLink>
            ) : (
              <span className="legal-contact__muted">יש להגדיר LEGAL_EMAIL</span>
            )}
          </dd>
        </dl>

        <p className="legal-contact__links">
          <Link href="/terms">תקנון</Link>
          <Link href="/privacy">מדיניות פרטיות</Link>
        </p>
      </LegalPublicShell>
    </>
  )
}