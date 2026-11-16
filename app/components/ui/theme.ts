/**
 * BINO Manager — Color Palette V2 semantic tokens.
 * Source: docs/planning/BINO_COLOR_PALETTE_V2.md
 * Marketing palette lives in globals.css (--color-marketing-*) only.
 */

export const theme = {
  colors: {
    // Surfaces
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceHover: '#F8FAFC',
    surfaceActive: '#EFF6FF',
    surfaceSelected: '#DBEAFE',
    surfaceInset: '#F1F5F9',
    muted: '#F1F5F9',
    /** @deprecated prefer surfaceInset — same value */
    mutedSurface: '#F8FAFC',

    // Borders
    border: '#E2E8F0',
    borderSubtle: '#EDF1F5',
    borderStrong: '#CBD5E1',
    borderFocus: '#2563EB',
    borderError: '#FDA4AF',
    borderSelected: '#93C5FD',

    // Text
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    textDisabled: '#94A3B8',
    textInverse: '#FFFFFF',
    textLink: '#1D4ED8',
    textOnPrimary: '#FFFFFF',

    // Brand / Primary
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    primaryActive: '#1E40AF',
    primaryMuted: 'rgba(37, 99, 235, 0.10)',
    primaryLight: '#DBEAFE',
    /** Legacy stronger tint — prefer primaryMuted / primaryLight */
    primarySubtle: 'rgba(37, 99, 235, 0.20)',
    primaryText: '#2563EB',
    focusRing: '#93C5FD',
    accent: '#2563EB',
    blueSoft: '#EFF6FF',
    brandSoft: '#EFF6FF',

    // Status
    success: '#047857',
    successMuted: '#D1FAE5',
    warning: '#B45309',
    warningMuted: '#FEF3C7',
    error: '#BE123C',
    errorMuted: '#FFE4E6',
    info: '#0369A1',
    infoMuted: '#E0F2FE',
    pending: '#6D28D9',
    pendingMuted: '#EDE9FE',
    neutral: '#475569',
    neutralMuted: '#F1F5F9',

    // Sidebar / Nav
    navy: '#0F172A',
    navySoft: '#1E293B',
    sidebar: '#0F172A',
    sidebarHover: '#1E293B',
    sidebarActive: '#1E3A5F',
    sidebarActiveIndicator: '#60A5FA',
    sidebarBorder: '#334155',
    navText: '#CBD5E1',
    navTextActive: '#FFFFFF',
    navTextMuted: '#94A3B8',

    // Cards / Dashboard
    cardBackground: '#FFFFFF',
    cardBorder: '#E2E8F0',
    cardHover: '#F8FAFC',
    cardHighlight: '#EFF6FF',
    kpiPositive: '#047857',
    kpiNegative: '#BE123C',
    kpiNeutral: '#64748B',
    divider: '#EDF1F5',

    // Charts
    chartPrimary: '#2563EB',
    chartSecondary: '#0891B2',
    chartTertiary: '#7C3AED',
    chartSuccess: '#059669',
    chartWarning: '#D97706',
    chartDanger: '#E11D48',
    chartGrid: '#E2E8F0',
    chartAxis: '#64748B',
    chartTooltip: '#0F172A',

    // Financial / Collection
    paymentPaid: '#047857',
    paymentPaidMuted: '#D1FAE5',
    paymentPending: '#B45309',
    paymentPendingMuted: '#FEF3C7',
    paymentOverdue: '#BE123C',
    paymentOverdueMuted: '#FFE4E6',
    paymentPartial: '#1D4ED8',
    paymentPartialMuted: '#DBEAFE',
    paymentExempt: '#475569',
    paymentExemptMuted: '#F1F5F9',

    // Buttons / Interactive
    buttonPrimary: '#2563EB',
    buttonPrimaryHover: '#1D4ED8',
    buttonPrimaryActive: '#1E40AF',
    buttonSecondary: '#FFFFFF',
    buttonSecondaryHover: '#F1F5F9',
    buttonGhostHover: '#F1F5F9',
    buttonDestructive: '#BE123C',
    buttonDestructiveHover: '#9F1239',
    inputBackground: '#FFFFFF',
    inputBorder: '#CBD5E1',
    inputFocus: '#2563EB',

    // Overlays & misc (not in V2 table — kept for existing UI)
    overlay: 'rgba(15, 23, 42, 0.45)',
    overlayLight: 'rgba(15, 23, 42, 0.2)',
    sand: '#FEF3C7',
  },
  radius: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
    xxxl: '48px',
  },
  typography: {
    fontSize: {
      xs: '12px',
      sm: '13px',
      base: '15px',
      lg: '17px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '28px',
      '4xl': '34px',
      '5xl': '40px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  shadows: {
    none: 'none',
    xs: '0 1px 2px rgba(15, 23, 42, 0.04)',
    sm: '0 2px 8px rgba(15, 23, 42, 0.06)',
    md: '0 4px 14px rgba(15, 23, 42, 0.08)',
    lg: '0 8px 28px rgba(15, 23, 42, 0.1)',
    xl: '0 16px 40px rgba(15, 23, 42, 0.12)',
    focus: '0 0 0 4px rgba(37, 99, 235, 0.2)',
    primaryBtn: '0 2px 6px rgba(37, 99, 235, 0.22)',
  },
  motion: {
    fast: '180ms',
    base: '220ms',
    slow: '240ms',
  },
}