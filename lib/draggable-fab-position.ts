export type FabPosition = {
  left: number
  top: number
}

export const DEFAULT_FAB_SIZE_PX = 56
export const DEFAULT_FAB_MARGIN_PX = 20
/** Space above mobile bottom nav + a little breathing room */
export const DEFAULT_FAB_BOTTOM_RESERVE_PX = 72

export function defaultFabPosition(
  viewportWidth: number,
  viewportHeight: number,
  options?: {
    size?: number
    margin?: number
    bottomReserve?: number
    safeAreaBottom?: number
  }
): FabPosition {
  const size = options?.size ?? DEFAULT_FAB_SIZE_PX
  const margin = options?.margin ?? DEFAULT_FAB_MARGIN_PX
  const bottomReserve = options?.bottomReserve ?? DEFAULT_FAB_BOTTOM_RESERVE_PX
  const safeAreaBottom = options?.safeAreaBottom ?? 0
  return {
    left: margin,
    top: Math.max(
      margin,
      viewportHeight - size - margin - bottomReserve - safeAreaBottom
    ),
  }
}

export function clampFabPosition(
  position: FabPosition,
  viewportWidth: number,
  viewportHeight: number,
  options?: {
    size?: number
    margin?: number
    bottomReserve?: number
    safeAreaBottom?: number
  }
): FabPosition {
  const size = options?.size ?? DEFAULT_FAB_SIZE_PX
  const margin = options?.margin ?? DEFAULT_FAB_MARGIN_PX
  const bottomReserve = options?.bottomReserve ?? DEFAULT_FAB_BOTTOM_RESERVE_PX
  const safeAreaBottom = options?.safeAreaBottom ?? 0

  const maxLeft = Math.max(margin, viewportWidth - size - margin)
  const maxTop = Math.max(
    margin,
    viewportHeight - size - margin - bottomReserve - safeAreaBottom
  )

  return {
    left: Math.min(maxLeft, Math.max(margin, position.left)),
    top: Math.min(maxTop, Math.max(margin, position.top)),
  }
}

export function parseFabPosition(raw: unknown): FabPosition | null {
  if (!raw || typeof raw !== 'object') return null
  const left = (raw as { left?: unknown }).left
  const top = (raw as { top?: unknown }).top
  if (typeof left !== 'number' || typeof top !== 'number') return null
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null
  return { left, top }
}

export function readFabPosition(storageKey: string): FabPosition | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    return parseFabPosition(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeFabPosition(storageKey: string, position: FabPosition): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(position))
  } catch {
    // private mode / quota — ignore
  }
}
