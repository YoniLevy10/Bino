'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, Card, SearchInput, theme } from '@/app/components/ui'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import {
  formatWorkerPhoneDisplay,
  normalizeWorkerPhone,
} from '@/lib/worker-phones'
import {
  notesFromFixlyPerson,
  tradeFromFixlyCategory,
  type FixlyDirectoryPerson,
} from '@/lib/fixly/pro-waitlist-directory'

type DirectoryResponse = {
  configured?: boolean
  rows?: FixlyDirectoryPerson[]
  hasMore?: boolean
  error?: unknown
}

type Props = {
  knownPhones: Array<string | null | undefined>
  onAdded: () => void
}

export function FixlyDirectoryPanel({ knownPhones, onAdded }: Props) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<FixlyDirectoryPerson[]>([])
  const [configured, setConfigured] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (debounced) params.set('q', debounced)
    const qs = params.toString()
    void fetchWithTimeout(`/api/professionals/fixly-directory${qs ? `?${qs}` : ''}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as DirectoryResponse
        if (!res.ok) {
          throw new Error(errorMessageFromResponseJson(json, 'טעינת מאגר Fixly נכשלה'))
        }
        if (ac.signal.aborted) return
        setConfigured(json.configured !== false)
        setRows(Array.isArray(json.rows) ? json.rows : [])
        setHasMore(Boolean(json.hasMore))
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'טעינת מאגר Fixly נכשלה')
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [debounced])

  const known = useMemo(() => {
    const set = new Set<string>()
    for (const phone of knownPhones) {
      const normalized = phone ? normalizeWorkerPhone(phone) : ''
      if (normalized) set.add(normalized)
    }
    return set
  }, [knownPhones])

  async function addToBook(person: FixlyDirectoryPerson) {
    const phone = normalizeWorkerPhone(person.phone)
    if (!phone) {
      toast.error('מספר הטלפון במאגר לא תקין')
      return
    }
    setAddingId(person.id)
    try {
      const email = person.email?.trim() ?? ''
      const res = await fetchWithTimeout(
        '/api/create-professional',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: person.full_name,
            phone: person.phone,
            trade: tradeFromFixlyCategory(person.category),
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
            notes: notesFromFixlyPerson(person),
            is_active: true,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as { error?: unknown }
      if (!res.ok) {
        throw new Error(errorMessageFromResponseJson(json, 'הוספה לפנקס נכשלה'))
      }
      toast.success(TM.professionalCreated)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הוספה לפנקס נכשלה')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Card>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>מאגר Fixly</div>
          <div style={styles.subtitle}>
            בעלי מקצוע שנרשמו ב-Fixly. הוספה לפנקס שומרת אותם אצלכם להעברת תקלות ב-SMS.
          </div>
        </div>
      </div>

      {!configured ? (
        <p style={styles.hint}>המאגר עדיין לא מחובר. פנו לתמיכה.</p>
      ) : (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="חיפוש לפי שם, תחום, עיר או טלפון..."
            style={{ maxWidth: 360, marginBottom: 16 }}
          />
          {loading ? (
            <p style={styles.hint}>טוען את המאגר...</p>
          ) : error ? (
            <p style={styles.hint}>{error}</p>
          ) : rows.length === 0 ? (
            <p style={styles.hint}>
              {debounced ? 'אין התאמה במאגר Fixly.' : 'עדיין אין בעלי מקצוע במאגר Fixly.'}
            </p>
          ) : (
            <div style={styles.list}>
              {rows.map((person) => {
                const normalized = normalizeWorkerPhone(person.phone)
                const inBook = Boolean(normalized && known.has(normalized))
                const phoneLabel = normalized ? formatWorkerPhoneDisplay(person.phone) : person.phone
                return (
                  <div key={person.id} style={styles.card}>
                    <div style={styles.name}>{person.full_name}</div>
                    <div style={styles.sub}>
                      {[person.category, person.city].filter(Boolean).join(' · ') || 'ללא תחום'}
                    </div>
                    <div style={styles.phone}>{phoneLabel}</div>
                    <Button
                      variant={inBook ? 'secondary' : 'primary'}
                      size="sm"
                      disabled={inBook || !normalized || addingId === person.id}
                      loading={addingId === person.id}
                      onClick={() => void addToBook(person)}
                    >
                      {inBook ? 'בפנקס' : 'הוסף לפנקס'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
          {hasMore ? (
            <p style={styles.hint}>מוצגות 40 התוצאות הראשונות. צמצמו בחיפוש כדי לראות אחרות.</p>
          ) : null}
        </>
      )}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  header: { marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700, color: theme.colors.textPrimary },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4, lineHeight: 1.45 },
  hint: { margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.colors.textSecondary },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },
  card: {
    padding: 14,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  name: { fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary },
  sub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, marginBottom: 8, lineHeight: 1.4 },
  phone: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 10 },
}
