/**
 * Shared V2 manager surface fragments (Figma delivery language).
 * Pages should adopt these for content padding, tables, chips, and list cards
 * instead of leaving legacy density / radius / hairlines.
 */
import type { CSSProperties } from 'react'
import { theme } from './theme'

export const managerV2 = {
  content: {
    padding: '32px 40px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  } satisfies CSSProperties,
  contentNarrow: {
    padding: '32px 40px',
    maxWidth: '960px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  } satisfies CSSProperties,
  contentMobile: {
    padding: '16px 16px 32px',
    maxWidth: '100%',
    boxSizing: 'border-box',
  } satisfies CSSProperties,
  sectionGap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  } satisfies CSSProperties,
  tableTh: {
    textAlign: 'start',
    padding: '12px 16px',
    fontSize: 12,
    fontWeight: 600,
    color: theme.colors.textMuted,
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.mutedSurface,
  } satisfies CSSProperties,
  tableTd: {
    padding: '14px 16px',
    fontSize: 14,
    color: theme.colors.textPrimary,
    borderBottom: `1px solid ${theme.colors.border}`,
    verticalAlign: 'middle',
  } satisfies CSSProperties,
  filterChip: {
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textSecondary,
    borderRadius: theme.radius.md,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 40,
    fontFamily: 'inherit',
    transition: `background ${theme.motion.fast} ease, color ${theme.motion.fast} ease, border-color ${theme.motion.fast} ease`,
  } satisfies CSSProperties,
  filterChipActive: {
    background: theme.colors.blueSoft,
    color: theme.colors.primary,
    borderColor: theme.colors.primary,
  } satisfies CSSProperties,
  listCard: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    boxShadow: theme.shadows.xs,
  } satisfies CSSProperties,
  entityCard: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.xl,
    padding: '20px 23px',
    boxShadow: theme.shadows.xs,
    transition: `border-color ${theme.motion.base} ease, box-shadow ${theme.motion.base} ease`,
  } satisfies CSSProperties,
  filtersBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.mutedSurface,
  } satisfies CSSProperties,
  input: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: 15,
    color: theme.colors.textPrimary,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  } satisfies CSSProperties,
}
