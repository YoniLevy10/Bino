'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { theme } from './ui'
import {
  clampFabPosition,
  defaultFabPosition,
  DEFAULT_FAB_BOTTOM_RESERVE_PX,
  DEFAULT_FAB_MARGIN_PX,
  DEFAULT_FAB_SIZE_PX,
  readFabPosition,
  writeFabPosition,
  type FabPosition,
} from '@/lib/draggable-fab-position'

const DRAG_THRESHOLD_PX = 8

type DraggableFabProps = {
  storageKey: string
  ariaLabel: string
  onClick: () => void
  children?: ReactNode
  size?: number
  /** Reserved space above the bottom edge (e.g. mobile bottom nav). */
  bottomReservePx?: number
  zIndex?: number
}

function readSafeAreaBottom(): number {
  if (typeof window === 'undefined') return 0
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;bottom:0;padding-bottom:env(safe-area-inset-bottom,0px)'
  document.body.appendChild(probe)
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom || '0') || 0
  probe.remove()
  return value
}

export function DraggableFab({
  storageKey,
  ariaLabel,
  onClick,
  children = '+',
  size = DEFAULT_FAB_SIZE_PX,
  bottomReservePx = DEFAULT_FAB_BOTTOM_RESERVE_PX,
  zIndex = 90,
}: DraggableFabProps) {
  const [position, setPosition] = useState<FabPosition | null>(null)
  const [dragging, setDragging] = useState(false)
  const positionRef = useRef<FabPosition | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
    moved: boolean
  } | null>(null)

  const clampOpts = useCallback(
    () => ({
      size,
      margin: DEFAULT_FAB_MARGIN_PX,
      bottomReserve: bottomReservePx,
      safeAreaBottom: readSafeAreaBottom(),
    }),
    [bottomReservePx, size]
  )

  const resolveDefault = useCallback((): FabPosition => {
    return defaultFabPosition(window.innerWidth, window.innerHeight, clampOpts())
  }, [clampOpts])

  const setClampedPosition = useCallback(
    (next: FabPosition) => {
      const clamped = clampFabPosition(
        next,
        window.innerWidth,
        window.innerHeight,
        clampOpts()
      )
      positionRef.current = clamped
      setPosition(clamped)
      return clamped
    },
    [clampOpts]
  )

  useEffect(() => {
    const opts = clampOpts()
    const saved = readFabPosition(storageKey)
    const next = saved
      ? clampFabPosition(saved, window.innerWidth, window.innerHeight, opts)
      : defaultFabPosition(window.innerWidth, window.innerHeight, opts)
    positionRef.current = next
    setPosition(next)
  }, [clampOpts, storageKey])

  useEffect(() => {
    function onResize() {
      const base = positionRef.current ?? resolveDefault()
      setClampedPosition(base)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [resolveDefault, setClampedPosition])

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const current = positionRef.current ?? resolveDefault()
    if (!positionRef.current) setClampedPosition(current)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: current.left,
      originTop: current.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return

    drag.moved = true
    setDragging(true)
    setClampedPosition({
      left: drag.originLeft + dx,
      top: drag.originTop + dy,
    })
  }

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const didDrag = drag.moved
    dragRef.current = null
    setDragging(false)

    if (didDrag) {
      if (positionRef.current) writeFabPosition(storageKey, positionRef.current)
      return
    }

    onClick()
  }

  const style: CSSProperties = {
    position: 'fixed',
    left: position?.left ?? DEFAULT_FAB_MARGIN_PX,
    top: position?.top ?? undefined,
    bottom:
      position == null
        ? `calc(${bottomReservePx}px + env(safe-area-inset-bottom, 0px))`
        : undefined,
    zIndex,
    width: size,
    height: size,
    borderRadius: '50%',
    border: 'none',
    background: theme.colors.primary,
    color: '#fff',
    fontSize: Math.round(size * 0.5),
    fontWeight: 300,
    lineHeight: 1,
    cursor: dragging ? 'grabbing' : 'grab',
    boxShadow: theme.shadows.lg,
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-grabbed={dragging}
      title="גרור כדי להזיז · לחיצה לפתיחת תקלה"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onClick={(event) => {
        // Click is handled on pointerup so drag doesn't open the modal.
        event.preventDefault()
      }}
      style={style}
    >
      {children}
    </button>
  )
}
