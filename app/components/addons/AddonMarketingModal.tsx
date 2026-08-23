'use client'

import Link from 'next/link'
import { useEffect, type CSSProperties } from 'react'
import { AddonFeaturePreview } from '@/app/components/addons/AddonFeaturePreview'
import { AddonSidebarPinButton } from '@/app/components/addons/AddonSidebarPinButton'
import { BAMAKOR_BRAND } from '@/lib/addons-nav'
import { formatAddonPriceDisplay } from '@/lib/paid-addons'
import type { PaidAddonDisplayEntry } from '@/lib/paid-addons-catalog'
import { Button, theme } from '../ui'

type AddonMarketingModalProps = {
  open: boolean
  entry: PaidAddonDisplayEntry | null
  isMobile?: boolean
  onClose: () => void
}

export function AddonMarketingModal({
  open,
  entry,
  isMobile,
  onClose,
}: AddonMarketingModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !entry) return null

  const { marketing } = entry

  return (
    <>
      <div style={styles.overlay} onClick={onClose} aria-hidden />
      <div
        className={isMobile ? 'app-modal-sheet-root' : undefined}
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="addon-marketing-title"
      >
        <div style={styles.header}>
          <div>
            <p style={styles.kicker}>{entry.tagline}</p>
            <h2 id="addon-marketing-title" style={styles.title}>
              {entry.title}
            </h2>
            <p style={styles.price}>
              {formatAddonPriceDisplay(entry.price_ils_monthly)}
            </p>
          </div>
          <button type="button" style={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className={isMobile ? 'app-modal-sheet-scroll' : undefined}
          style={isMobile ? styles.bodyScroll : styles.body}
        >
          <div style={styles.previewWrap}>
            <AddonFeaturePreview addonId={entry.id} locked={entry.locked} />
          </div>

          <p style={styles.headline}>{marketing.headline}</p>
          <p style={styles.intro}>{marketing.intro}</p>

          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>מה תקבלו</h3>
            <ul style={styles.list}>
              {marketing.valueProps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>מתאים במיוחד ל</h3>
            <ul style={styles.list}>
              {marketing.scenarios.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <p style={styles.closing}>{marketing.closing}</p>

          {entry.locked ? (
            <div style={styles.ctaBox}>
              <p style={styles.ctaText}>
                מעוניינים להפעיל את <strong>{entry.title}</strong> בחשבון שלכם?
              </p>
              <p style={styles.ctaContact}>
                ליצירת קשר והפעלה: <strong>הנהלת {BAMAKOR_BRAND}</strong>
              </p>
            </div>
          ) : (
            <div style={{ ...styles.ctaBox, background: theme.colors.successMuted }}>
              <p style={{ ...styles.ctaText, color: theme.colors.success, margin: '0 0 12px' }}>
                התוסף פעיל בחשבון שלכם.
              </p>
              <div style={styles.ctaActions}>
                <Link href={entry.featureHref}>
                  <Button variant="primary">{entry.featureCtaHe}</Button>
                </Link>
                <AddonSidebarPinButton entry={entry} />
              </div>
            </div>
          )}
        </div>

        <div className={isMobile ? 'app-modal-sheet-footer' : undefined} style={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            סגירה
          </Button>
        </div>
      </div>
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    zIndex: 400,
  },
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '92%',
    maxWidth: '560px',
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    zIndex: 401,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: '20px 20px 12px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  kicker: {
    margin: '0 0 4px',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.primary,
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.3,
  },
  price: {
    margin: '6px 0 0',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  closeBtn: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    background: 'transparent',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
  },
  body: {
    padding: '16px 20px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  bodyScroll: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  previewWrap: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  headline: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.45,
  },
  intro: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: 1.65,
  },
  section: {
    margin: 0,
  },
  sectionTitle: {
    margin: '0 0 8px',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  list: {
    margin: 0,
    paddingInlineStart: 20,
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  closing: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
    lineHeight: 1.6,
    padding: '12px 14px',
    background: theme.colors.primaryMuted,
    borderRadius: theme.radius.md,
    borderInlineStart: `3px solid ${theme.colors.primary}`,
  },
  ctaBox: {
    padding: '14px 16px',
    borderRadius: theme.radius.md,
    background: theme.colors.warningMuted,
    border: `1px solid ${theme.colors.border}`,
  },
  ctaActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  ctaText: {
    margin: '0 0 8px',
    fontSize: '14px',
    color: theme.colors.textPrimary,
    lineHeight: 1.5,
  },
  ctaContact: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textSecondary,
  },
  footer: {
    padding: '12px 20px 20px',
    borderTop: `1px solid ${theme.colors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
  },
}
