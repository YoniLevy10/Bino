'use client'

import { useLayoutEffect, useState } from 'react'
import { getIsMobileViewport } from '@/lib/mobile-viewport'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useLayoutEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return isMobile
}
