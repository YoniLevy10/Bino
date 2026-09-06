'use client'

import Link from 'next/link'
import type { ReactNode, CSSProperties } from 'react'
import { Card, Button, theme } from './ui'
import { usePaidAddons } from './PaidAddonsContext'
import { formatAddonPriceDisplay, type PaidAddonKey } from '@/lib/paid-addons'

type Props = {
  addonKey: PaidAddonKey
  children: ReactNode
}

/** Wraps paid feature UI — shows upgrade card when add-on is not enabled. */
export function PaidAddonGate({ addonKey, children }: Props) {
  const { isBootstrapped, hasAddon, getAddon, catalogMissing } = usePaidAddons()

  if (!isBootstrapped) {
    return <div style={styles.loading}>טוען הרשאות...</div>
  }

  if (catalogMissing) {
    return (
      <Card>
        <p style={styles.text}>
          מערכת התוספים בתשלום טרם הופעלה בשרת. הריצו מיגרציה <code>046_paid_addons.sql</code> ב-Supabase.
        </p>
      </Card>
    )
  }

  if (hasAddon(addonKey)) {
    return <>{children}</>
  }

  const addon = getAddon(addonKey)
  const name = addon?.name_he || 'תוסף בתשלום'
  const price = addon?.price_ils_monthly ?? 0
  const desc = addon?.description_he

  return (
    <Card>
      <div style={styles.upgrade}>
        <h2 style={styles.title}>תוסף בתשלום — {name}</h2>
        {desc ? <p style={styles.text}>{desc}</p> : null}
        <p style={styles.price}>
          מחיר: <strong>{formatAddonPriceDisplay(price)}</strong>
        </p>
        <p style={styles.hint}>
          להפעלת התוסף פנו לצוות Bino. לאחר ההפעלה תוכלו לגשת לפיצ&apos;ר מהדף תוספים בתשלום.
        </p>
        <div style={styles.actions}>
          <Link href="/addons">
            <Button variant="primary">לדף תוספים בתשלום</Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  loading: { padding: 24, textAlign: 'center', color: theme.colors.textMuted },
  upgrade: { display: 'flex', flexDirection: 'column', gap: 12 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: theme.colors.textPrimary },
  text: { margin: 0, fontSize: 15, lineHeight: 1.5, color: theme.colors.textSecondary },
  price: { margin: 0, fontSize: 16, color: theme.colors.textPrimary },
  hint: { margin: 0, fontSize: 14, color: theme.colors.textMuted, lineHeight: 1.45 },
  actions: { marginTop: 8 },
}
