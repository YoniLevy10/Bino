'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import styles from './login.module.css'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { getClientPublicOrigin } from '@/lib/public-origin'
import { googleOAuthRedirect, isBinoIosShell, postOAuthURLToNativeShell } from '@/lib/native-shell'
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

export function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const authError = searchParams.get('error')
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

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

  // iOS PWA: if session cookies survived, skip the login form instead of
  // forcing Google/password again (signIn* also called signOut and wiped them).
  useEffect(() => {
    const hardBlock =
      authError === 'no_access' || authError === 'multi_tenant' || authError === 'auth'
    if (hardBlock) return

    let cancelled = false
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return
      const next =
        redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/dashboard'
      router.replace(next)
      router.refresh()
    })
    return () => {
      cancelled = true
    }
  }, [authError, redirectTo, router])

  async function signInWithGoogle() {
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      // Prevent stale sessions from a previous tenant showing after a failed login attempt.
      await unsubscribeManagerPushBestEffort()
      await supabase.auth.signOut()
      clearTenantBrowserCaches()
      const next =
        redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/dashboard'
      const shell = isBinoIosShell()
      const { redirectTo: oauthRedirect, skipBrowserRedirect } = googleOAuthRedirect(
        next,
        getClientPublicOrigin(),
        shell,
      )
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Explicit next keeps post-login landings stable; callback attaches cookies
          // onto the redirect response (see app/auth/callback/route.ts).
          redirectTo: oauthRedirect,
          skipBrowserRedirect,
        },
      })
      if (oauthError) throw oauthError
      if (skipBrowserRedirect && !postOAuthURLToNativeShell(data?.url ?? '')) {
        throw new Error('לא הצלחנו לפתוח את ההתחברות עם Google')
      }
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
        redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/dashboard'
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
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <section className={styles.formPanel} aria-labelledby="login-title">
          <div className={styles.formContent}>
            <div className={styles.formHeading}>
              <p className={styles.eyebrow}>כניסה למערכת BINO</p>
              <h1 id="login-title" className={styles.formTitle}>שמחים לראות אותך שוב</h1>
              <p className={styles.formDescription}>התחברו לחשבון הניהול כדי להמשיך.</p>
            </div>

            <form
              className={styles.form}
              onSubmit={(e) => void signInWithPassword(e)}
              aria-busy={loading}
              aria-describedby={error ? 'login-error' : undefined}
            >
              <label className={styles.field}>
                <span>כתובת אימייל</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={loading}
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span>סיסמה</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className={styles.input}
                />
              </label>

              <button type="submit" disabled={loading} className={styles.submitButton}>
                {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
                {loading ? 'מתחבר…' : 'התחברות'}
              </button>
            </form>

            <div className={styles.divider} aria-hidden="true">
              <span>או להמשיך באמצעות</span>
            </div>

            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={loading}
              className={styles.googleButton}
            >
              <GoogleIcon />
              {loading ? 'מפנים…' : 'המשך עם Google'}
            </button>

            {error ? (
              <p id="login-error" className={styles.errorMessage} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <aside className={styles.brandPanel} aria-labelledby="login-brand-title">
          <div className={styles.brandHeader} dir="ltr">
            <Image
              src="/apple-icon.png"
              alt=""
              width={48}
              height={48}
              priority
              className={styles.brandLogo}
            />
            <div className={styles.wordmark}>
              <span className={styles.wordmarkName}>BINO</span>
              <span className={styles.wordmarkTagline}>Building Intelligence &amp; Operations</span>
            </div>
          </div>

          <div className={styles.brandCopy}>
            <p className={styles.brandEyebrow}>ניהול חכם. חיים שקטים.</p>
            <h2 id="login-brand-title" className={styles.brandTitle}>
              הבניין שלך,
              <br />
              <span>בשליטה שלך.</span>
            </h2>
            <p className={styles.brandDescription}>
              קריאות שירות, תחזוקה ועדכונים — כל מה שחשוב לניהול הבניין, במקום אחד.
            </p>
          </div>

          <div className={styles.featurePanel} aria-hidden="true">
            <p className={styles.featureHeading}>כלי עבודה לניהול השוטף</p>
            <div className={styles.featureGrid}>
              <div className={styles.featureTile}>
                <span className={`${styles.featureGlyph} ${styles.glyphBlue}`} />
                <span>קריאות שירות</span>
              </div>
              <div className={styles.featureTile}>
                <span className={`${styles.featureGlyph} ${styles.glyphLight}`} />
                <span>תחזוקה</span>
              </div>
              <div className={styles.featureTile}>
                <span className={`${styles.featureGlyph} ${styles.glyphOutline}`} />
                <span>עדכונים</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
