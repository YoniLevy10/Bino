/**
 * Meta adapter — official Graph API only; mock vs live labeled.
 */
export type MetaMode = 'mock' | 'live'

export function getMetaMode(): MetaMode {
  const mode = (process.env.META_MODE ?? 'mock').toLowerCase()
  return mode === 'live' ? 'live' : 'mock'
}

export function getMetaGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? 'v21.0'
}

export function getMetaGraphBaseUrl(): string {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`
}

export type MetaDataLabel = 'MOCK DATA' | 'LIVE META DATA'

export function getMetaDataLabel(): MetaDataLabel {
  return getMetaMode() === 'live' ? 'LIVE META DATA' : 'MOCK DATA'
}
