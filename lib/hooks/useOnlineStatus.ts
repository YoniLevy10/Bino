'use client'

import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
