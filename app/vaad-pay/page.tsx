import type { Metadata } from 'next'
import { getLegalSiteConfig } from '@/lib/legal-site-config'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { VaadPayContent } from '@/app/components/legal/VaadPayContent'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: 'תשלום דמי ועד',
  description: 'תשלום מאובטח של דמי ועד וחיובים דיגיטליים דרך BINO ו־Grow.',
  alternates: { canonical: `${origin}/vaad-pay` },
  openGraph: {
    title: 'תשלום דמי ועד | BINO',
    description: 'תשלום מאובטח של דמי ועד וחיובים דיגיטליים',
    url: `${origin}/vaad-pay`,
    locale: 'he_IL',
  },
  robots: { index: true, follow: true },
}

/**
 * Platform-level service page (fallback).
 * Each paying merchant uses /vaad-pay/{clientId} for their own Grow KYC — not this URL.
 */
export default function VaadPayLandingPage() {
  const cfg = getLegalSiteConfig()

  return (
    <LegalPublicShell backHref="/contact" backLabel="יצירת קשר →">
      <VaadPayContent
        cfg={cfg}
        incompleteHint={
          cfg.readyForGrowAudit
            ? 'עמוד זה שייך לפלטפורמת Bino. כל חברת ניהול ממלאת בהגדרות → Grow את פרטי העסק שקולט את הכסף, ומגישה את העמוד האישי (/vaad-pay/…).'
            : 'חסרים טלפון ו/או כתובת בהגדרות השרת (`LEGAL_PHONE`, `LEGAL_ADDRESS`). לקוחות הפלטפורמה ממלאים פרטים בהגדרות → Grow ומגישים את העמוד האישי שלהם.'
        }
      />
    </LegalPublicShell>
  )
}
