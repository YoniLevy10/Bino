import {
  BINO_IOS_BUNDLE_ID,
  buildAppleAppSiteAssociation,
} from '@/lib/apple-app-site-association'

export type IosReadinessItem = {
  id: string
  labelHe: string
  status: 'ok' | 'todo' | 'info'
  detailHe: string
}

export type IosReadinessReport = {
  bundleId: string
  teamIdConfigured: boolean
  aasaBuildable: boolean
  items: IosReadinessItem[]
  readyForTestFlight: boolean
  appStoreSubmitInScope: false
}

/**
 * Server-side iOS shell readiness (no App Store submit).
 * Does not expose the raw APPLE_TEAM_ID.
 */
export function buildIosReadinessReport(opts?: {
  appleTeamId?: string | null
  aasaHttpOk?: boolean | null
}): IosReadinessReport {
  const teamId = (opts?.appleTeamId ?? process.env.APPLE_TEAM_ID ?? '').trim()
  const aasa = buildAppleAppSiteAssociation(teamId)
  const teamIdConfigured = aasa != null
  const aasaHttpOk = opts?.aasaHttpOk

  const items: IosReadinessItem[] = [
    {
      id: 'shell',
      labelHe: 'מעטפת WKWebView (ios/BINO)',
      status: 'ok',
      detailHe: `קיימת בפרויקט · bundle ${BINO_IOS_BUNDLE_ID}`,
    },
    {
      id: 'associated_domains',
      labelHe: 'Associated Domains',
      status: 'ok',
      detailHe: 'applinks:bino.casa + webcredentials:bino.casa ב־BINO.entitlements',
    },
    {
      id: 'apple_team_id',
      labelHe: 'APPLE_TEAM_ID ב־Vercel',
      status: teamIdConfigured ? 'ok' : 'todo',
      detailHe: teamIdConfigured
        ? 'מוגדר (10 תווים) — AASA ניתן לבנייה'
        : 'חסר או לא תקין — הגדירו Team ID של Apple Developer',
    },
    {
      id: 'aasa_route',
      labelHe: 'קובץ AASA ב־/.well-known',
      status: !teamIdConfigured
        ? 'todo'
        : aasaHttpOk === false
          ? 'todo'
          : aasaHttpOk === true
            ? 'ok'
            : 'info',
      detailHe:
        aasaHttpOk === true
          ? 'נגיש ומחזיר JSON תקין'
          : aasaHttpOk === false
            ? 'לא נגיש כרגע — בדקו deploy / APPLE_TEAM_ID'
            : teamIdConfigured
              ? 'מוכן לפרסום כש־APPLE_TEAM_ID בפרודקשן'
              : 'ממתין ל־APPLE_TEAM_ID',
    },
    {
      id: 'capacitor',
      labelHe: 'Capacitor / rewrite',
      status: 'info',
      detailHe: 'מחוץ לסקופ — נשארים עם WKWebView הקיים',
    },
    {
      id: 'app_store',
      labelHe: 'הגשת App Store / TestFlight',
      status: 'info',
      detailHe: 'מחוץ לסקופ עד גישת Apple Developer + אישור כתוב',
    },
  ]

  const readyForTestFlight =
    teamIdConfigured && (aasaHttpOk === true || aasaHttpOk == null)

  return {
    bundleId: BINO_IOS_BUNDLE_ID,
    teamIdConfigured,
    aasaBuildable: teamIdConfigured,
    items,
    readyForTestFlight,
    appStoreSubmitInScope: false,
  }
}
