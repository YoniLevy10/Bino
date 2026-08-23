import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPublicGrowMerchant } from '@/lib/client-grow-legal-server'
import { growLegalFromClientRow, growLegalToSiteConfig } from '@/lib/client-grow-legal'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { VaadPayContent } from '@/app/components/legal/VaadPayContent'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ clientId: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { clientId } = await params
  const row = await loadPublicGrowMerchant(clientId)
  if (!row) return { title: 'תשלום דמי ועד' }
  const legal = growLegalFromClientRow(row)
  return {
    title: `תשלום דמי ועד | ${legal.businessName}`,
    description: `תשלום מאובטח של דמי ועד וחיובים דיגיטליים — ${legal.businessName}`,
  }
}

/**
 * Per-tenant Grow / clearing website audit page.
 * Each Morning account must submit THIS URL (the merchant who receives the money).
 */
export default async function ClientVaadPayPage({ params }: PageProps) {
  const { clientId } = await params
  const row = await loadPublicGrowMerchant(clientId)
  if (!row) notFound()

  const legal = growLegalFromClientRow(row)
  const cfg = growLegalToSiteConfig(legal)
  const serviceHref = `/vaad-pay/${clientId}`
  const contactHref = `/vaad-pay/${clientId}/contact`

  return (
    <LegalPublicShell
      merchant={cfg}
      backHref={contactHref}
      backLabel="יצירת קשר →"
      serviceHref={serviceHref}
      contactHref={contactHref}
    >
      <VaadPayContent
        cfg={cfg}
        contactHref={contactHref}
        incompleteHint={
          legal.ready
            ? null
            : 'חסרים שם עסק, טלפון או כתובת בהגדרות הלקוח. יש להשלים לפני הגשה ל־Grow בחשבון Morning של בית העסק.'
        }
      />
    </LegalPublicShell>
  )
}
