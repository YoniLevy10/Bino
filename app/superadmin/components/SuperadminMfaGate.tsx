'use client'

import { FormEvent, useCallback, useEffect, useState, type ReactNode } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { LoadingButton } from '@/app/components/LoadingButton'
import { supabase } from '@/lib/supabase'
import { getClientPublicOrigin } from '@/lib/public-origin'
import { purgeLegacyAdminSecret } from '@/lib/admin-secret-session'

type SessionStatus = {
  authenticated: boolean
  allowed: boolean
  aal: string | null
  nextLevel: string | null
  email: string | null
  userId: string | null
  hasVerifiedFactor?: boolean
  code?: string
  error?: string
}

type GatePhase =
  | 'loading'
  | 'sign_in'
  | 'forbidden'
  | 'enroll'
  | 'challenge'
  | 'ready'

type Props = {
  children: (ctx: { email: string | null; userId: string; refresh: () => Promise<void> }) => ReactNode
}

export function SuperadminMfaGate({ children }: Props) {
  const [phase, setPhase] = useState<GatePhase>('loading')
  const [status, setStatus] = useState<SessionStatus | null>(null)
  const [hadLegacySecret, setHadLegacySecret] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [factorId, setFactorId] = useState<string | null>(null)
  const [totpUri, setTotpUri] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [enrollCode, setEnrollCode] = useState('')

  const [challengeFactorId, setChallengeFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [challengeCode, setChallengeCode] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    const res = await fetch('/api/superadmin/session', { credentials: 'same-origin' })
    const json = (await res.json()) as SessionStatus
    setStatus(json)

    if (!json.authenticated) {
      setPhase('sign_in')
      return
    }
    if (!json.allowed) {
      setPhase('forbidden')
      return
    }
    if (json.aal === 'aal2') {
      setPhase('ready')
      return
    }
    if (json.hasVerifiedFactor) {
      setPhase('challenge')
      return
    }
    setPhase('enroll')
  }, [])

  useEffect(() => {
    const had = purgeLegacyAdminSecret()
    setHadLegacySecret(had)
    void refresh()
  }, [refresh])

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error: pwError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (pwError) throw new Error(pwError.message || 'התחברות נכשלה')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'התחברות נכשלה')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    setBusy(true)
    setError('')
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${getClientPublicOrigin()}/auth/callback?next=${encodeURIComponent('/superadmin')}`,
        },
      })
      if (oauthError) throw oauthError
    } catch (err) {
      setError(err instanceof Error ? err.message : 'התחברות נכשלה')
      setBusy(false)
    }
  }

  async function startEnroll() {
    setBusy(true)
    setError('')
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `BINO Superadmin ${new Date().toISOString().slice(0, 10)}`,
      })
      if (enrollError) throw enrollError
      setFactorId(data.id)
      setTotpUri(data.totp.uri)
      setTotpSecret(data.totp.secret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הרשמת MFA נכשלה')
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault()
    if (!factorId || !enrollCode.trim()) return
    setBusy(true)
    setError('')
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: enrollCode.trim(),
      })
      if (verifyError) throw verifyError
      setEnrollCode('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אימות הקוד נכשל')
    } finally {
      setBusy(false)
    }
  }

  async function startChallenge() {
    setBusy(true)
    setError('')
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) throw listError
      const totp = (factors.totp ?? []).find((f) => f.status === 'verified')
      if (!totp) throw new Error('לא נמצא גורם MFA מאומת — יש להירשם מחדש')
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      })
      if (challengeError) throw challengeError
      setChallengeFactorId(totp.id)
      setChallengeId(challenge.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אתגר MFA נכשל')
    } finally {
      setBusy(false)
    }
  }

  async function confirmChallenge(e: FormEvent) {
    e.preventDefault()
    if (!challengeFactorId || !challengeId || !challengeCode.trim()) return
    setBusy(true)
    setError('')
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: challengeFactorId,
        challengeId,
        code: challengeCode.trim(),
      })
      if (verifyError) throw verifyError
      setChallengeCode('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'קוד MFA שגוי')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    try {
      await supabase.auth.signOut()
      purgeLegacyAdminSecret()
      setFactorId(null)
      setTotpUri(null)
      setChallengeFactorId(null)
      setChallengeId(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (phase === 'enroll' && !factorId && !busy) {
      void startEnroll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    if (phase === 'challenge' && !challengeId && !busy) {
      void startChallenge()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (phase === 'ready' && status?.userId) {
    return <>{children({ email: status.email, userId: status.userId, refresh })}</>
  }

  return (
    <div className="sa-lock" dir="rtl">
      <div className="sa-lock-card">
        <div className="sa-brand">
          <span className="sa-brand-mark" aria-hidden>
            B
          </span>
          <div>
            <h1>Super Admin</h1>
            <p className="sa-muted">כניסה עם זהות משתמש + MFA</p>
          </div>
        </div>

        {hadLegacySecret ? (
          <div className="sa-banner sa-banner-error" role="status">
            סיסמת המערכת הישנה (localStorage) בוטלה. יש להתחבר עם חשבון מורשה ולהפעיל MFA.
          </div>
        ) : null}

        {phase === 'loading' ? <p className="sa-muted">בודק סשן…</p> : null}

        {phase === 'sign_in' ? (
          <>
            <form className="sa-lock-form" onSubmit={(e) => void signInWithPassword(e)}>
              <label className="sa-lock-field">
                <span>אימייל</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label className="sa-lock-field">
                <span>סיסמה</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <LoadingButton type="submit" loading={busy} className="sa-btn sa-btn-primary">
                התחברות
              </LoadingButton>
            </form>
            <button
              type="button"
              className="sa-btn sa-btn-ghost"
              disabled={busy}
              onClick={() => void signInWithGoogle()}
            >
              התחבר עם Google
            </button>
          </>
        ) : null}

        {phase === 'forbidden' ? (
          <>
            <p className="sa-banner sa-banner-error">
              החשבון מחובר ({status?.email ?? 'ללא אימייל'}) אינו ברשימת סופר־אדמין.
            </p>
            <LoadingButton type="button" loading={busy} className="sa-btn sa-btn-ghost" onClick={() => void signOut()}>
              החלף חשבון
            </LoadingButton>
          </>
        ) : null}

        {phase === 'enroll' ? (
          <>
            <p className="sa-muted">סרוק את ה-QR באפליקציית Authenticator ואשר בקוד חד-פעמי.</p>
            {totpUri ? (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                <QRCodeCanvas value={totpUri} size={180} includeMargin />
              </div>
            ) : (
              <p className="sa-muted">מכין גורם TOTP…</p>
            )}
            {totpSecret ? (
              <p className="sa-muted" style={{ wordBreak: 'break-all', fontSize: 12 }}>
                מפתח גיבוי: {totpSecret}
              </p>
            ) : null}
            <form className="sa-lock-form" onSubmit={(e) => void confirmEnroll(e)}>
              <label className="sa-lock-field">
                <span>קוד MFA</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value)}
                  placeholder="000000"
                  required
                />
              </label>
              <LoadingButton type="submit" loading={busy} className="sa-btn sa-btn-primary">
                אשר והפעל MFA
              </LoadingButton>
            </form>
          </>
        ) : null}

        {phase === 'challenge' ? (
          <>
            <p className="sa-muted">הזן קוד MFA מהאפליקציה ({status?.email})</p>
            <form className="sa-lock-form" onSubmit={(e) => void confirmChallenge(e)}>
              <label className="sa-lock-field">
                <span>קוד MFA</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={challengeCode}
                  onChange={(e) => setChallengeCode(e.target.value)}
                  placeholder="000000"
                  required
                  autoFocus
                />
              </label>
              <LoadingButton type="submit" loading={busy} className="sa-btn sa-btn-primary">
                אימות
              </LoadingButton>
            </form>
            <button
              type="button"
              className="sa-btn sa-btn-ghost"
              disabled={busy}
              onClick={() => void startChallenge()}
            >
              קבל אתגר חדש
            </button>
          </>
        ) : null}

        {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}

        {phase !== 'sign_in' && phase !== 'loading' ? (
          <div className="sa-lock-setup" style={{ marginTop: 16 }}>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => void signOut()}>
              יציאה
            </button>
          </div>
        ) : null}

        <div className="sa-lock-setup">
          <a href="/superadmin/setup">הקמת לקוח חדש</a>
        </div>
      </div>
    </div>
  )
}
