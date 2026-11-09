'use client'

import { useEffect, useState } from 'react'

export type VisualViewportFrame = {
  top: number
  height: number
  keyboardOpen: boolean
}

/** Keep a fixed chat sheet inside the visible viewport when the mobile keyboard opens. */
export function useVisualViewportFrame(active: boolean): VisualViewportFrame | null {
  const [frame, setFrame] = useState<VisualViewportFrame | null>(null)

  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return

    const sync = () => {
      setFrame({
        top: vv.offsetTop,
        height: vv.height,
        keyboardOpen: window.innerHeight - vv.height > 80,
      })
    }

    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [active])

  return active ? frame : null
}

/** Stop the page behind a full-screen chat from scrolling (worker shell + manager main). */
export function useChatSheetScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    document.body.classList.add('wa-sheet-open')
    return () => document.body.classList.remove('wa-sheet-open')
  }, [active])
}
