# BINO — Improved Color Palette V2 (Manager)

**סטטוס:** נעול בתוכנית 2.0 · כיוון Premium B2B SaaS  
**יישום:** Semantic Tokens בלבד · WCAG AA · Marketing מופרד מ־Manager  
**קבצים קיימים להרחבה:** [`app/components/ui/theme.ts`](../../app/components/ui/theme.ts), [`app/globals.css`](../../app/globals.css) · Marketing: [`app/components/marketing/marketing.css`](../../app/components/marketing/marketing.css)

---

## Brand / Primary

| Token | Hex |
|--------|-----|
| primary | `#2563EB` |
| primaryHover | `#1D4ED8` |
| primaryActive | `#1E40AF` |
| primaryMuted | `rgba(37, 99, 235, 0.10)` |
| primaryLight | `#DBEAFE` |
| blueSoft / brandSoft | `#EFF6FF` |
| focusRing | `#93C5FD` |

## Surfaces

| Token | Hex |
|--------|-----|
| background / canvas | `#F8FAFC` |
| surface | `#FFFFFF` |
| surfaceElevated | `#FFFFFF` |
| muted | `#F1F5F9` |
| surfaceHover | `#F8FAFC` |
| surfaceActive | `#EFF6FF` |
| surfaceSelected | `#DBEAFE` |
| surfaceInset | `#F1F5F9` |

## Text

| Token | Hex |
|--------|-----|
| textPrimary | `#0F172A` |
| textSecondary | `#475569` |
| textMuted | `#64748B` |
| textDisabled | `#94A3B8` |
| textInverse | `#FFFFFF` |
| textLink | `#1D4ED8` |
| textOnPrimary | `#FFFFFF` |

## Borders

| Token | Hex |
|--------|-----|
| border | `#E2E8F0` |
| borderSubtle | `#EDF1F5` |
| borderStrong | `#CBD5E1` |
| borderFocus | `#2563EB` |
| borderError | `#FDA4AF` |
| borderSelected | `#93C5FD` |

## Status

| Token | Hex | Muted |
|--------|-----|--------|
| success | `#047857` | `#D1FAE5` |
| warning | `#B45309` | `#FEF3C7` |
| error | `#BE123C` | `#FFE4E6` |
| info | `#0369A1` | `#E0F2FE` |
| pending | `#6D28D9` | `#EDE9FE` |
| neutral | `#475569` | `#F1F5F9` |

## Sidebar / Nav

| Token | Hex |
|--------|-----|
| navy / sidebar | `#0F172A` |
| navySoft | `#1E293B` |
| sidebarHover | `#1E293B` |
| sidebarActive | `#1E3A5F` |
| sidebarActiveIndicator | `#60A5FA` |
| navText | `#CBD5E1` |
| navTextActive | `#FFFFFF` |
| navTextMuted | `#94A3B8` |
| sidebarBorder | `#334155` |

## Cards / Dashboard

| Token | Hex |
|--------|-----|
| cardBackground | `#FFFFFF` |
| cardBorder | `#E2E8F0` |
| cardHover | `#F8FAFC` |
| cardHighlight | `#EFF6FF` |
| kpiPositive | `#047857` |
| kpiNegative | `#BE123C` |
| kpiNeutral | `#64748B` |
| divider | `#EDF1F5` |

## Data Visualization / Charts

| Token | Hex |
|--------|-----|
| chartPrimary | `#2563EB` |
| chartSecondary | `#0891B2` |
| chartTertiary | `#7C3AED` |
| chartSuccess | `#059669` |
| chartWarning | `#D97706` |
| chartDanger | `#E11D48` |
| chartGrid | `#E2E8F0` |
| chartAxis | `#64748B` |
| chartTooltip | `#0F172A` |

## Financial / Collection

| Token | Hex |
|--------|-----|
| paymentPaid | `#047857` |
| paymentPaidMuted | `#D1FAE5` |
| paymentPending | `#B45309` |
| paymentPendingMuted | `#FEF3C7` |
| paymentOverdue | `#BE123C` |
| paymentOverdueMuted | `#FFE4E6` |
| paymentPartial | `#1D4ED8` |
| paymentPartialMuted | `#DBEAFE` |
| paymentExempt | `#475569` |
| paymentExemptMuted | `#F1F5F9` |

## Buttons / Interactive

| Token | Hex |
|--------|-----|
| buttonPrimary | `#2563EB` |
| buttonPrimaryHover | `#1D4ED8` |
| buttonPrimaryActive | `#1E40AF` |
| buttonSecondary | `#FFFFFF` |
| buttonSecondaryHover | `#F1F5F9` |
| buttonGhostHover | `#F1F5F9` |
| buttonDestructive | `#BE123C` |
| buttonDestructiveHover | `#9F1239` |
| inputBackground | `#FFFFFF` |
| inputBorder | `#CBD5E1` |
| inputFocus | `#2563EB` |

## Marketing בלבד (לא ממשק מנהל)

| Token | Hex |
|--------|-----|
| paper | `#F6F6F0` |
| ink | `#102033` |
| primary | `#1769EF` |
| primaryHover | `#1255C7` |
| accent | `#9BE4C5` |
| accentSoft | `#E4F8EE` |
| surface | `#FFFFFF` |
| mutedText | `#64748B` |

---

## עקרונות יישום

1. **מקור אמת אחד:** `theme.ts` + CSS variables ב־`globals.css` — רכיבים צורכים tokens, לא hex שרירותי.  
2. **Manager ≠ Marketing:** לא לערבב `#1769EF` / paper בתוך AppShell מנהל.  
3. **Finance/גבייה:** להשתמש ב־`payment*` לסטטוסי חיוב; `kpi*` / `chart*` לדוחות.  
4. **Hub Modal + Sidebar:** `sidebar*` + `surfaceSelected` / `cardHighlight` לעקביות.  
5. **נגישות:** ניגודיות טקסט על משטחים לפי WCAG AA; `focusRing` לפוקוס מקלדת.  
6. **PR נפרד / מוקדם:** Palette V2 completion לפני/עם Hub UI — כדי שמסכי Finance לא ייכתבו עם צבעים ישנים.

## מול המצב הקיים

חלק מהטוקנים כבר ב־`theme.ts` / `globals.css` (primary `#2563EB`, canvas `#F8FAFC`, sidebar `#0F172A`).  
V2 **משלים** היררכיה: nav states, charts, payment statuses, buttons, borders מורחבים, `primaryMuted` ל־`0.10`, `borderSubtle` ל־`#EDF1F5`.
