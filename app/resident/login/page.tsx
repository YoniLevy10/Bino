'use client'

import { FormEvent, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ResidentAlert,
  ResidentAmbientWash,
  ResidentCard,
  ResidentField,
  ResidentMuted,
  ResidentPageTitle,
  ResidentPrimaryButton,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

function ResidentLoginForm() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('token') || searchParams.get('invite') || ''
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(
    searchParams.get('error') === 'no_access'
      ? 'אין חברות פעילה בפורטל עבור חשבון זה. פנו לחברת הניהול.'
      : ''
  )
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/resident/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, inviteToken: inviteToken || undefined }),
      })
      const json = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) {
        setError(json.error || 'שליחת קישור נכשלה')
        return
      }
      setMessage(json.message || 'נשלח קישור התחברות לדוא״ל.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="resident-shell" style={{ ...residentShellStyles.root, justifyContent: 'center' }} dir="rtl">
      <ResidentAmbientWash />
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
          padding: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <ResidentCard style={{ padding: 24 }}>
          <ResidentPageTitle>כניסה לפורטל הדיירים</ResidentPageTitle>
          <ResidentMuted style={{ margin: '8px 0 20px' }}>
            הזינו את כתובת הדוא״ל שאליה קיבלתם הזמנה מחברת הניהול. נשלח קישור חד־פעמי להתחברות.
          </ResidentMuted>
          <label style={residentShellStyles.label}>דוא״ל</label>
          <ResidentField
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginBottom: 16 }}
          />
          {error ? (
            <div style={{ marginBottom: 12 }}>
              <ResidentAlert tone="error">{error}</ResidentAlert>
            </div>
          ) : null}
          {message ? (
            <div style={{ marginBottom: 12 }}>
              <ResidentAlert tone="success">{message}</ResidentAlert>
            </div>
          ) : null}
          <ResidentPrimaryButton type="submit" disabled={loading}>
            {loading ? 'שולח…' : 'שלחו קישור התחברות'}
          </ResidentPrimaryButton>
        </ResidentCard>
      </form>
    </div>
  )
}

export default function ResidentLoginPage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" style={{ padding: 24, color: residentTheme.colors.textMuted }}>
          טוען…
        </div>
      }
    >
      <ResidentLoginForm />
    </Suspense>
  )
}
