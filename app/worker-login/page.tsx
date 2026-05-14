'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export default function WorkerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setError('נא להזין כתובת אימייל')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/worker-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'אימייל לא נמצא במערכת')
        return
      }
      const token = (json as { token?: string }).token
      if (!token) {
        setError('שגיאה פנימית — נסו שוב')
        return
      }
      router.push(`/worker?token=${encodeURIComponent(token)}`)
    } catch {
      setError('שגיאת חיבור — נסו שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>כניסת עובד</h1>
        <p style={styles.subtitle}>הזינו את כתובת האימייל שלכם לצפייה בתקלות המשויכות אליכם</p>

        <form onSubmit={handleLogin} style={styles.form} noValidate>
          <div style={styles.formGroup}>
            <label htmlFor="email" style={styles.label}>אימייל</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              style={styles.input}
              autoComplete="email"
              inputMode="email"
              disabled={loading}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }} disabled={loading}>
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F8FAFC',
    padding: '24px',
    direction: 'rtl',
    fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
  },
  card: {
    background: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid #E2E8F0',
    padding: '40px 36px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#0F172A',
    margin: '0 0 8px 0',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748B',
    textAlign: 'center',
    margin: '0 0 32px 0',
    lineHeight: 1.6,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#475569',
  },
  input: {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    fontSize: '15px',
    color: '#0F172A',
    background: '#FFFFFF',
    outline: 'none',
    textAlign: 'right',
  },
  error: {
    fontSize: '13px',
    color: '#EF4444',
    margin: 0,
    textAlign: 'center',
  },
  button: {
    padding: '13px',
    borderRadius: '8px',
    border: 'none',
    background: '#3B82F6',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  buttonDisabled: {
    background: '#93C5FD',
    cursor: 'not-allowed',
  },
}
