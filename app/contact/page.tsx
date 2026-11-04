import type { Metadata } from 'next'
import Link from 'next/link'
import { getLegalSiteConfig } from '@/lib/legal-site-config'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { MarketingAnalytics } from '@/app/components/marketing/MarketingAnalytics'
import { MarketingLeadLink } from '@/app/components/marketing/MarketingLeadLink'
import { WhatsAppIcon } from '@/app/components/marketing/WhatsAppIcon'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'
import { waDemoUrl } from '@/lib/marketing-copy'
import '@/app/components/legal/legal-contact.css'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: 'יצירת קשר | BINO',
  description: 'לתיאום הדגמה או לשאלה על BINO — שלחו לנו הודעה בוואטסאפ.',
  alternates: { canonical: `${origin}/contact` },
  openGraph: {
    title: 'יצירת קשר | BINO',
    description: 'לתיאום הדגמה ותמיכה — BINO',
    url: `${origin}/contact`,
    locale: 'he_IL',
  },
  robots: { index: true, follow: true },
}

export default function ContactPage() {
  const legal = getLegalSiteConfig()
  const { email } = legal
  const whatsappHref = waDemoUrl('he', legal.phoneConfigured ? legal.phone : undefined)

  return (
    <>
      <MarketingAnalytics pagePath="/contact" />
      <LegalPublicShell backHref="/" backLabel="← חזרה לדף הבית">
        <h1 className="legal-contact__h1">יצירת קשר</h1>
        <p className="legal-contact__intro">
          לתיאום הדגמה או לשאלה על BINO — שלחו לנו הודעה, ונשמח לדבר.
        </p>

        <div className="legal-contact__channels">
          <MarketingLeadLink
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            method="whatsapp_demo"
            locale="he"
            placement="contact"
            className="legal-contact__whatsapp"
          >
            <span className="legal-contact__whatsapp-icon-wrap">
              <WhatsAppIcon className="legal-contact__whatsapp-icon" />
            </span>
            <span className="legal-contact__whatsapp-copy">
              <strong>שלחו לנו הודעה בוואטסאפ</strong>
              <span>לתיאום הדגמה או לשאלה על BINO</span>
            </span>
            <span className="legal-contact__whatsapp-arrow" aria-hidden="true">
              ↗
            </span>
          </MarketingLeadLink>

          {email ? (
            <div className="legal-contact__email">
              <span className="legal-contact__email-label">אפשר גם במייל</span>
              <MarketingLeadLink
                href={`mailto:${email}`}
                method="contact_email"
                placement="contact"
                className="legal-contact__email-link"
                dir="ltr"
              >
                {email}
              </MarketingLeadLink>
            </div>
          ) : null}
        </div>

        <p className="legal-contact__links">
          <Link href="/terms">תקנון</Link>
          <Link href="/privacy">מדיניות פרטיות</Link>
        </p>
      </LegalPublicShell>
    </>
  )
}
