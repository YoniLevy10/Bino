'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Button, Card, theme } from './ui'
import type { AddonEntitlement } from './PaidAddonsContext'
import { formatAddonPriceIls } from '@/lib/paid-addons'
import { PAID_ADDON_CARD_META } from '@/lib/paid-addon-cards'

type Props = {
  addons: AddonEntitlement[]
  catalogMissing?: boolean
  loading?: boolean
}

export function PaidAddonsGrid({ addons, catalogMissing, loading }: Props) {
  if (loading) {
    return <p style={styles.muted}>טוען תוספים...</p>
  }

  if (catalogMissing) {
    return (
      <Card>
        <p style={styles.note}>
          מערכת התוספים בתשלום טרם הופעלה בשרת. הריצו מיגרציות{' '}
          <code>046_paid_addons.sql</code> ו-<code>048_worker_stamp_paid_addon.sql</code> ב-Supabase.
        </p>
      </Card>
    )
  }

  if (addons.length === 0) {
    return <p style={styles.muted}>אין תוספים זמינים במחירון כרגע.</p>
  }

  return (
    <div style={styles.grid}>
      {addons.map((a) => {
        const meta = PAID_ADDON_CARD_META[a.addon_key as keyof typeof PAID_ADDON_CARD_META]
        return (
          <Card key={a.addon_key} style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>{a.name_he}</h3>
              <span
                style={{
                  ...styles.badge,
                  background: a.enabled ? theme.colors.successMuted : theme.colors.muted,
                  color: a.enabled ? theme.colors.success : theme.colors.textMuted,
                }}
              >
                {a.enabled ? 'פעיל בחשבון' : 'לא פעיל'}
              </span>
            </div>
            {a.description_he ? <p style={styles.desc}>{a.description_he}</p> : null}
            {meta?.highlights?.length ? (
              <ul style={styles.list}>
                {meta.highlights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <p style={styles.price}>
              {formatAddonPriceIls(a.price_ils_monthly)} <span style={styles.perMonth}>/ חודש</span>
            </p>
            <div style={styles.actions}>
              {a.enabled && meta ? (
                <Link href={meta.featureHref}>
                  <Button variant="primary">{meta.featureCtaHe}</Button>
                </Link>
              ) : (
                <p style={styles.activateHint}>
                  להפעלה פנו לצוות במקור וציינו את שם התוסף: <strong>{a.name_he}</strong>
                </p>
              )}
              <Link href="/billing" style={styles.billingLink}>
                חיוב ושימוש במנוי
              </Link>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  card: { display: 'flex', flexDirection: 'column', gap: 10, height: '100%' },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: theme.colors.textPrimary },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: theme.radius.full,
    flexShrink: 0,
  },
  desc: { margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.colors.textSecondary },
  list: {
    margin: '4px 0 0',
    paddingInlineStart: 20,
    fontSize: 13,
    lineHeight: 1.55,
    color: theme.colors.textSecondary,
  },
  price: { margin: '8px 0 0', fontSize: 17, fontWeight: 700, color: theme.colors.primary },
  perMonth: { fontSize: 14, fontWeight: 500, color: theme.colors.textMuted },
  actions: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 },
  activateHint: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.45,
    color: theme.colors.textMuted,
  },
  billingLink: { fontSize: 13, color: theme.colors.primary, textDecoration: 'none' },
  muted: { color: theme.colors.textMuted, fontSize: 14 },
  note: { margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.colors.textSecondary },
}
