'use client'

import type { CSSProperties } from 'react'
import { theme } from '@/app/components/ui/theme'

type Props = {
  rating: number | null | undefined
  /** When set, stars are interactive (1–5). */
  onChange?: (next: number) => void
  /** Allow clearing rating back to null (drawer form). */
  allowClear?: boolean
  onClear?: () => void
  size?: 'sm' | 'md'
  showEmptyLabel?: boolean
  /** Compact caption under stars, e.g. use count */
  caption?: string | null
}

/** Shared 1–5 personal rating control for professionals book + ticket forward. */
export function ProfessionalRatingStars({
  rating,
  onChange,
  allowClear = false,
  onClear,
  size = 'sm',
  showEmptyLabel = false,
  caption,
}: Props) {
  const value = typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : 0
  const interactive = typeof onChange === 'function'
  const fontSize = size === 'md' ? 22 : 16
  const hit = size === 'md' ? 36 : 28

  if (!interactive && value === 0) {
    if (!showEmptyLabel && !caption) return null
    return (
      <div style={styles.wrap}>
        {showEmptyLabel ? (
          <span style={{ ...styles.empty, fontSize: fontSize - 4 }} aria-label="ללא דירוג אישי">
            ללא דירוג אישי
          </span>
        ) : null}
        {caption ? <span style={styles.caption}>{caption}</span> : null}
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div
        role={interactive ? 'radiogroup' : 'img'}
        aria-label={value ? `דירוג אישי ${value} מתוך 5` : 'דירוג אישי'}
        style={{ ...styles.row, gap: size === 'md' ? 6 : 4 }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= value
          const starStyle: CSSProperties = {
            ...styles.star,
            width: hit,
            height: hit,
            fontSize,
            color: filled ? '#D97706' : theme.colors.borderStrong,
            background: interactive
              ? filled
                ? 'rgba(217, 119, 6, 0.12)'
                : theme.colors.muted
              : 'transparent',
            borderRadius: theme.radius.sm,
          }
          if (!interactive) {
            return (
              <span key={star} style={starStyle} aria-hidden>
                ★
              </span>
            )
          }
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={star === value}
              aria-label={`${star} כוכבים`}
              onClick={() => onChange?.(star)}
              style={starStyle}
            >
              ★
            </button>
          )
        })}
        {interactive && allowClear && value > 0 ? (
          <button
            type="button"
            onClick={() => onClear?.()}
            style={styles.clearBtn}
            aria-label="נקה דירוג"
          >
            נקה
          </button>
        ) : null}
      </div>
      {caption ? <span style={styles.caption}>{caption}</span> : null}
    </div>
  )
}

/** Label for select options: name — trade ★★★ */
export function formatProfessionalPickerLabel(p: {
  full_name: string
  trade?: string | null
  phone?: string | null
  personal_rating?: number | null
}): string {
  const parts = [p.full_name]
  if (p.trade) parts.push(p.trade)
  if (p.personal_rating && p.personal_rating >= 1) {
    parts.push('★'.repeat(p.personal_rating))
  }
  if (p.phone) parts.push(`(${p.phone})`)
  return parts.join(' — ')
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'flex-start',
  },
  row: {
    display: 'inline-flex',
    alignItems: 'center',
    direction: 'ltr',
    lineHeight: 1,
    flexWrap: 'wrap',
  },
  star: {
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
  },
  clearBtn: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 8px',
    fontFamily: 'inherit',
  },
  empty: {
    color: theme.colors.textMuted,
    fontWeight: 600,
  },
  caption: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: 500,
  },
}
