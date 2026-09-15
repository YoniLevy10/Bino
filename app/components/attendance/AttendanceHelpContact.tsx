'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { theme } from '../ui'

const BINO_SUPPORT = '972559899132'

export function AttendanceHelpContact() {
  const [phone, setPhone] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('clients').select('manager_phone').limit(1).maybeSingle()
      const mp = (data as { manager_phone?: string | null } | null)?.manager_phone?.trim()
      if (mp && !mp.includes('@')) setPhone(mp)
    })()
  }, [])

  const waNum = (phone || BINO_SUPPORT).replace(/\D/g, '')
  const waUrl = `https://wa.me/${waNum}?text=${encodeURIComponent('שלום, צריך עזרה עם חתמת עובדים')}`

  return (
    <p style={styles.wrap}>
      צריך עזרה?{' '}
      <a href={waUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
        שלחו הודעה ב-WhatsApp
      </a>
    </p>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { margin: '0 0 16px', fontSize: 14, color: theme.colors.textMuted },
  link: { color: theme.colors.primary, fontWeight: 600 },
}
