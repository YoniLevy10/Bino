'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** ניווט לטאב דיירים ממתינים בדף הדיירים (UI מלא שם). */
export default function PendingResidentsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/residents?tab=pending')
  }, [router])
  return null
}
