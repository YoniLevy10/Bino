import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadPublicGrowMerchant } from '@/lib/client-grow-legal-server'
import { growLegalFromClientRow, growLegalToSiteConfig } from '@/lib/client-grow-legal'
import { legalTelHref } from '@/lib/legal-site-config'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ clientId: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { clientId } = await params
  const row = await loadPublicGrowMerchant(clientId)
  if (!row) return { title: 'יצירת קשר' }
  const legal = growLegalFromClientRow(row)
  return {
    title: `יצירת קשר | ${legal.businessName}`,
    description: `טלפון, כתובת ומייל ליצירת קשר — ${legal.businessName}`,
  }
}

export default async function ClientGrowContactPage({ params }: PageProps) {
  const { clientId } = await params
  const row = await loadPublicGrowMerchant(clientId)
  if (!row) notFound()

  const legal = growLegalFromClientRow(row)
  const cfg = growLegalToSiteConfig(legal)
  const serviceHref = `/vaad-pay/${clientId}`

  return (
    <LegalPublicShell
      merchant={cfg}
      backHref={serviceHref}
      backLabel="← חזרה לעמוד השירות"
      serviceHref={serviceHref}
      contactHref={`/vaad-pay/${clientId}/contact`}
    >
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>יצירת קשר</h1>
      <p style={{ margin: '0 0 24px', color: '#475569', fontSize: 15 }}>
        פרטי בית העסק שגובה את החיוב. פרטים אלה נדרשים גם לאישור ספקי סליקה.
      </p>

      {!legal.ready ? (
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
          חסרים טלפון ו/או כתובת בהגדרות הלקוח. יש להשלים לפני הגשה ל־Grow.
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

        {cfg.email ? (
          <>
            <dt style={{ fontWeight: 700, color: '#64748b', fontSize: 13 }}>מייל</dt>
            <dd style={{ margin: '0 0 16px' }}>
              <a href={`mailto:${cfg.email}`} style={{ color: '#1e40af', fontWeight: 600 }} dir="ltr">
                {cfg.email}
              </a>
            </dd>
          </>
        ) : null}
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
