'use client'

import { useEffect } from 'react'

/** Legacy /superadmin/setup → in-SPA launch wizard. */
export default function SuperadminSetupRedirect() {
  useEffect(() => {
    window.location.replace('/superadmin#launch/new')
  }, [])

  return (
    <main dir="rtl" style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <p>מעבירים לאשף ההקמה…</p>
      <a href="/superadmin#launch/new">לחצו כאן אם לא הועברתם אוטומטית</a>
    </main>
  )
}
