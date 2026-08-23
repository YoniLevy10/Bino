import type { Metadata } from 'next'
import { getLegalSiteConfig } from '@/lib/legal-site-config'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { VaadPayContent } from '@/app/components/legal/VaadPayContent'

export const metadata: Metadata = {
  title: 'תשלום דמי ועד | במקור',
  description: 'תשלום מאובטח של דמי ועד וחיובים דיגיטליים — במקור',
}

/**
 * Platform-level service page (fallback).
 * Each paying merchant submits /vaad-pay/{clientId} in their own Morning — not this URL.
 */
export default function VaadPayLandingPage() {
  const cfg = getLegalSiteConfig()

  return (
    <LegalPublicShell backHref="/contact" backLabel="יצירת קשר →">
      <VaadPayContent
        cfg={cfg}
        incompleteHint={
          cfg.readyForGrowAudit
            ? 'עמוד זה שייך לפלטפורמת במקור. כל חברת ניהול מדביקה ב-Morning את העמוד האישי שלה (/vaad-pay/…), עם פרטי העסק שקולט את הכסף.'
            : 'חסרים טלפון ו/או כתובת בהגדרות השרת (`LEGAL_PHONE`, `LEGAL_ADDRESS`). לקוחות הפלטפורמה ממלאים פרטים בהגדרות → Morning ומגישים את העמוד האישי שלהם ל־Grow.'
        }
      />
    </LegalPublicShell>
  )
}
