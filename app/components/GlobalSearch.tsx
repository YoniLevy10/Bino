'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { theme } from './ui'
import { ticketDetailPath } from '@/lib/ticket-deep-link'

type SearchResult = {
  id: string
  label: string
  sub: string
  href: string
  type: 'ticket' | 'resident'
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const clientId = await resolveBinoClientIdForBrowser()
        const num = parseInt(q, 10)
        const [ticketsRes, residentsRes] = await Promise.all([
          withClientId(
            supabase
              .from('tickets')
              .select('id, ticket_number, description, status, projects(project_code, name)'),
            clientId
          )
            .or(isNaN(num) ? `description.ilike.%${q}%` : `description.ilike.%${q}%,ticket_number.eq.${num}`)
            .is('deleted_at', null)
            .limit(5),
          withClientId(
            supabase
              .from('residents')
              .select('id, full_name, phone, apartment_number'),
            clientId
          )
            .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,apartment_number.ilike.%${q}%`)
            .is('deleted_at', null)
            .limit(5),
        ])
        if (cancelled) return
        const res: SearchResult[] = []
        for (const t of (ticketsRes.data || [])) {
          const proj = Array.isArray(t.projects) ? t.projects[0] : t.projects
          const label = `#${t.ticket_number} – ${(t.description || '').slice(0, 60)}`
          res.push({ id: t.id, label, sub: proj?.name || proj?.project_code || t.status, href: ticketDetailPath(t.id), type: 'ticket' })
        }
        for (const r of (residentsRes.data || [])) {
          const sub = [r.phone, r.apartment_number ? `דירה ${r.apartment_number}` : null].filter(Boolean).join(' | ')
          res.push({ id: r.id, label: r.full_name, sub, href: '/residents', type: 'resident' })
        }
        setResults(res)
        setSelectedIdx(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 280)
    return () => { cancelled = true; clearTimeout(timer); setLoading(false) }
  }, [query])

  function navigate(result: SearchResult) {
    router.push(result.href)
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && results[selectedIdx]) navigate(results[selectedIdx])
    else if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '80px', background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        style={{ background: theme.colors.surface, borderRadius: theme.radius.xl, boxShadow: theme.shadows.xl, width: '560px', maxWidth: '92vw', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="חיפוש תקלות, דיירים..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '16px', color: theme.colors.textPrimary, background: 'transparent', textAlign: 'right', direction: 'rtl', fontFamily: 'inherit' }}
          />
          {loading && <span style={{ fontSize: '12px', color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>מחפש...</span>}
          <kbd style={{ fontSize: '11px', color: theme.colors.textMuted, border: `1px solid ${theme.colors.border}`, borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>Esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0', maxHeight: '360px', overflowY: 'auto' }}>
            {results.map((r, i) => (
              <li
                key={r.id}
                onClick={() => navigate(r)}
                onMouseEnter={() => setSelectedIdx(i)}
                style={{ padding: '10px 20px', cursor: 'pointer', background: i === selectedIdx ? theme.colors.primaryMuted : 'transparent', display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: theme.radius.full, background: r.type === 'ticket' ? theme.colors.warningMuted : theme.colors.successMuted, color: r.type === 'ticket' ? theme.colors.warning : theme.colors.success, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {r.type === 'ticket' ? 'תקלה' : 'דייר'}
                </span>
                <div style={{ flex: 1, textAlign: 'right', minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: theme.colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                  {r.sub && <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>{r.sub}</div>}
                </div>
              </li>
            ))}
          </ul>
        ) : query.length >= 2 && !loading ? (
          <p style={{ padding: '24px 20px', textAlign: 'center', color: theme.colors.textMuted, fontSize: '14px', margin: 0 }}>אין תוצאות עבור &ldquo;{query}&rdquo;</p>
        ) : (
          <p style={{ padding: '24px 20px', textAlign: 'center', color: theme.colors.textMuted, fontSize: '14px', margin: 0 }}>הקלד לפחות 2 תווים לחיפוש</p>
        )}

        {/* Footer hints */}
        <div style={{ padding: '8px 20px', borderTop: `1px solid ${theme.colors.borderSubtle}`, display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
          {['↑↓ ניווט', '↵ בחר', 'Esc סגור'].map((hint) => (
            <span key={hint} style={{ fontSize: '11px', color: theme.colors.textMuted }}>{hint}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
