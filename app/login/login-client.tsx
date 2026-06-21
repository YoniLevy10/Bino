'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { clearTenantBrowserCaches } from '@/lib/tenant-browser-cache'
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

export function LoginClient() {
  const searchParams = useSearchParams()

  const authError = searchParams.get('error')

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
          gap: '28px',
        }}
      >
        <Image
          src="/apple-icon.png"
          alt="במקור"
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
            במקור
          </h1>
          <p style={{ margin: 0, fontSize: '17px', color: '#475569', lineHeight: 1.5, fontWeight: 500 }}>
            מערכת ניהול תקלות לבניינים
          </p>
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
          {loading ? 'מפנים ל-Google…' : 'התחבר עם Google'}
        </button>

        {error ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c', textAlign: 'center' }}>{error}</p>
        ) : null}
      </div>
    </div>
  )
}
