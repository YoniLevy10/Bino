'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

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
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#F2F4F8',
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        }}
      >
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>כניסה לפורטל הדיירים</h1>
        <p style={{ margin: '0 0 20px', color: '#86868B', fontSize: 14, lineHeight: 1.5 }}>
          הזינו את כתובת הדוא״ל שאליה קיבלתם הזמנה מחברת הניהול. נשלח קישור חד־פעמי להתחברות.
        </p>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>דוא״ל</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: 48,
            fontSize: 16,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #D1D1D6',
            marginBottom: 16,
          }}
        />
        {error ? (
          <div role="alert" style={{ color: '#FF3B30', marginBottom: 12, fontSize: 14 }}>
            {error}
          </div>
        ) : null}
        {message ? (
          <div role="status" style={{ color: '#16a34a', marginBottom: 12, fontSize: 14 }}>
            {message}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            minHeight: 48,
            border: 'none',
            borderRadius: 12,
            background: '#007AFF',
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'שולח…' : 'שלחו קישור התחברות'}
        </button>
      </form>
    </div>
  )
}

export default function ResidentLoginPage() {
  return (
    <Suspense fallback={<div dir="rtl" style={{ padding: 24 }}>טוען…</div>}>
      <ResidentLoginForm />
    </Suspense>
  )
}
