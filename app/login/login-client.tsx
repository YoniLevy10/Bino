'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { clearTenantBrowserCaches } from '@/lib/tenant-browser-cache'
import { unsubscribeManagerPushBestEffort } from '@/lib/manager-push-client'
import { TENANT_ACCESS_DENIED_HE, TENANT_MULTI_CLIENT_DENIED_HE } from '@/lib/tenant-access'

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 48,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: '#fff',
  fontSize: 16,
  color: '#0f172a',
  outline: 'none',
}

export function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const authError = searchParams.get('error')
  const redirectTo = searchParams.get('redirectTo') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    authError === 'auth'
      ? 'ההתחברות נכשלה. נסו שוב.'
      : authError === 'multi_tenant'
        ? TENANT_MULTI_CLIENT_DENIED_HE
        : authError === 'no_access'
          ? TENANT_ACCESS_DENIED_HE
          : ''
  )

  async function signInWithGoogle() {
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      // Prevent stale sessions from a previous tenant showing after a failed login attempt.
      await unsubscribeManagerPushBestEffort()
      await supabase.auth.signOut()
      clearTenantBrowserCaches()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (oauthError) throw oauthError
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message || '')
          : 'התחברות נכשלה'
      setError(msg || 'התחברות נכשלה')
      setLoading(false)
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault()
    setError('')
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) {
      setError('נא להזין אימייל וסיסמה')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      await unsubscribeManagerPushBestEffort()
      await supabase.auth.signOut()
      clearTenantBrowserCaches()
      const { error: pwError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })
      if (pwError) {
        const msg = pwError.message || ''
        if (/invalid login credentials/i.test(msg)) {
          throw new Error('אימייל או סיסמה שגויים')
        }
        if (/email not confirmed/i.test(msg)) {
          throw new Error('יש לאשר את כתובת האימייל לפני הכניסה')
        }
        throw new Error(msg || 'התחברות נכשלה')
      }
      const next =
        redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/'
      router.replace(next)
      router.refresh()
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message || '')
          : 'התחברות נכשלה'
      setError(msg || 'התחברות נכשלה')
      setLoading(false)
    }
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        paddingTop: 'calc(32px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <Image
          src="/apple-icon.png"
          alt="Bino"
          width={88}
          height={88}
          priority
          style={{ borderRadius: 20, boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)' }}
        />

        <div style={{ textAlign: 'center' }}>
          <h1
            style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            Bino
          </h1>
          <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#64748b', lineHeight: 1.4, fontWeight: 600, letterSpacing: '0.04em' }}>
            Building Intelligence &amp; Operations
          </p>
          <p style={{ margin: 0, fontSize: '17px', color: '#475569', lineHeight: 1.5, fontWeight: 500 }}>
            מערכת ניהול תקלות לבניינים
          </p>
        </div>

        <form
          onSubmit={(e) => void signInWithPassword(e)}
          style={{
            width: '100%',
            maxWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
            }}
          >
            אימייל
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              disabled={loading}
              style={{ ...fieldStyle, direction: 'ltr', textAlign: 'left' }}
            />
          </label>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
            }}
          >
            סיסמה
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              style={{ ...fieldStyle, direction: 'ltr', textAlign: 'left' }}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              minHeight: 52,
              marginTop: 4,
              borderRadius: 12,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.75 : 1,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            }}
          >
            {loading ? 'מתחבר…' : 'התחברות'}
          </button>
        </form>

        <div
          style={{
            width: '100%',
            maxWidth: 320,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#94a3b8',
            fontSize: 13,
          }}
        >
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          או
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        </div>

        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: '100%',
            maxWidth: '320px',
            minHeight: '52px',
            padding: '14px 22px',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: '#0f172a',
            fontSize: '16px',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            opacity: loading ? 0.75 : 1,
          }}
        >
          <GoogleIcon />
          {loading ? 'מפנים…' : 'התחבר עם Google'}
        </button>

        {error ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c', textAlign: 'center' }}>{error}</p>
        ) : null}
      </div>
    </div>
  )
}
