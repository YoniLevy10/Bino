'use client'

import { useState } from 'react'
import { theme } from '@/app/components/ui'

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="sa-icon-btn"
      title={label ? `העתק ${label}` : 'העתק'}
      aria-label={label ? `העתק ${label}` : 'העתק'}
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
      style={{ color: copied ? theme.colors.success : theme.colors.textMuted }}
    >
      {copied ? '✓' : 'העתק'}
    </button>
  )
}
