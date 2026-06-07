'use client'

import { useState, type CSSProperties } from 'react'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Card,
  Button,
  theme,
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { useEffect } from 'react'

export default function AssistantPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [question, setQuestion] = useState('כמה תקלות פתוחות יש?')
  const [answer, setAnswer] = useState<string | null>(null)
  const [facts, setFacts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function ask() {
    setLoading(true)
    setAnswer(null)
    try {
      const res = await fetchWithTimeout('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const json = (await res.json()) as { answer?: string; facts?: string[]; error?: string }
      if (!res.ok) throw new Error(json.error || 'שגיאה')
      setAnswer(json.answer ?? null)
      setFacts(json.facts ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader title="עוזר מנהל" subtitle="תמונת מצב מהירה" onMenuClick={() => setMenuOpen(true)} />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={styles.content}>
        {!isMobile && (
          <PageHeader title="עוזר מנהל" subtitle="שאלו על תקלות, בניינים ודיירים — תשובה מנתוני המערכת" />
        )}

        <Card>
          <label htmlFor="assistant-q" style={styles.label}>שאלה</label>
          <textarea
            id="assistant-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            style={styles.textarea}
          />
          <Button onClick={() => void ask()} disabled={loading || question.trim().length < 2}>
            {loading ? 'חושב…' : 'שאל'}
          </Button>

          {answer && (
            <div style={styles.answer} role="status" aria-live="polite">
              <p style={styles.answerText}>{answer}</p>
              {facts.length > 0 && (
                <ul style={styles.facts}>
                  {facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: { padding: '24px 32px', maxWidth: 640, margin: '0 auto' },
  label: { display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 },
  textarea: {
    width: '100%',
    padding: 10,
    borderRadius: 8,
    border: `1px solid ${theme.colors.border}`,
    fontFamily: 'inherit',
    marginBottom: 12,
  },
  answer: { marginTop: 20, paddingTop: 16, borderTop: `1px solid ${theme.colors.border}` },
  answerText: { margin: '0 0 12px', fontSize: 15, lineHeight: 1.5 },
  facts: { margin: 0, paddingRight: 20, color: theme.colors.textMuted, fontSize: 13 },
}
