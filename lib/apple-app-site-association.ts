/** Bundle id of the App Store shell. Keep in sync with ios/BINO/AppConfig.swift. */
export const BINO_IOS_BUNDLE_ID = 'casa.bino.app'

const TEAM_ID = /^[A-Z0-9]{10}$/

export type AppleAppSiteAssociation = {
  applinks: {
    details: Array<{
      appIDs: string[]
      components: Array<Record<string, string>>
    }>
  }
  webcredentials: {
    apps: string[]
  }
}

/**
 * Universal Links + webcredentials for the iOS shell.
 * Returns null until APPLE_TEAM_ID is a real 10-character Apple Team ID.
 */
export function buildAppleAppSiteAssociation(
  teamId: string,
  bundleId = BINO_IOS_BUNDLE_ID,
): AppleAppSiteAssociation | null {
  const team = teamId.trim().toUpperCase()
  if (!TEAM_ID.test(team)) return null
  const appId = `${team}.${bundleId}`
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          components: [
            { '/': '/auth/callback' },
            { '/': '/login*' },
            { '/': '/dashboard*' },
            { '/': '/tickets*' },
            { '/': '/projects*' },
            { '/': '/worker*' },
            { '/': '/resident*' },
            { '/': '/calendar*' },
            { '/': '/tasks*' },
            { '/': '/report*' },
            { '/': '/*' },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [appId],
    },
  }
}
