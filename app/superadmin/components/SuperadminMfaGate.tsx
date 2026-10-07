'use client'

import { FormEvent, useCallback, useEffect, useState, type ReactNode } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { LoadingButton } from '@/app/components/LoadingButton'
import { supabase } from '@/lib/supabase'
import { getClientPublicOrigin } from '@/lib/public-origin'
import { googleOAuthRedirect, isBinoIosShell, postOAuthURLToNativeShell } from '@/lib/native-shell'
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
      const shell = isBinoIosShell()
      const { redirectTo, skipBrowserRedirect } = googleOAuthRedirect(
        '/superadmin',
        getClientPublicOrigin(),
        shell,
      )
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect },
      })
      if (oauthError) throw oauthError
      if (skipBrowserRedirect && !postOAuthURLToNativeShell(data?.url ?? '')) {
        throw new Error('לא הצלחנו לפתוח את ההתחברות עם Google')
      }
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
          <div className="sa-lock-stack">
            <form className="sa-form-stack sa-lock-form" onSubmit={(e) => void signInWithPassword(e)}>
              <div className="sa-field">
                <label htmlFor="sa-lock-email">אימייל</label>
                <input
                  id="sa-lock-email"
                  className="sa-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="sa-field">
                <label htmlFor="sa-lock-password">סיסמה</label>
                <input
                  id="sa-lock-password"
                  className="sa-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <LoadingButton
                type="submit"
                loading={busy}
                className="sa-btn sa-btn-primary sa-lock-submit"
                style={{ width: '100%', display: 'flex' }}
              >
                התחברות
              </LoadingButton>
            </form>
            <button
              type="button"
              className="sa-btn sa-btn-ghost sa-lock-submit"
              disabled={busy}
              onClick={() => void signInWithGoogle()}
            >
              התחבר עם Google
            </button>
          </div>
        ) : null}

        {phase === 'forbidden' ? (
          <div className="sa-lock-stack">
            <p className="sa-banner sa-banner-error">
              החשבון מחובר ({status?.email ?? 'ללא אימייל'}) אינו ברשימת סופר־אדמין.
            </p>
            <p className="sa-muted">
              הלשוניות (לקוחות, לידים, תפעול…) נשארות אחרי כניסה מורשית + MFA — הן לא נמחקו.
              החליפו לחשבון מורשה או בקשו להוסיף את המייל ל־allowlist.
            </p>
            <LoadingButton
              type="button"
              loading={busy}
              className="sa-btn sa-btn-primary sa-lock-submit"
              style={{ width: '100%', display: 'flex' }}
              onClick={() => void signOut()}
            >
              החלף חשבון
            </LoadingButton>
          </div>
        ) : null}

        {phase === 'enroll' ? (
          <div className="sa-lock-stack">
            <p className="sa-muted">סרוק את ה-QR באפליקציית Authenticator ואשר בקוד חד-פעמי.</p>
            {totpUri ? (
              <div className="sa-lock-qr">
                <QRCodeCanvas value={totpUri} size={180} includeMargin />
              </div>
            ) : (
              <p className="sa-muted">מכין גורם TOTP…</p>
            )}
            {totpSecret ? (
              <p className="sa-muted sa-lock-backup">מפתח גיבוי: {totpSecret}</p>
            ) : null}
            <form className="sa-form-stack sa-lock-form" onSubmit={(e) => void confirmEnroll(e)}>
              <div className="sa-field">
                <label htmlFor="sa-lock-enroll-code">קוד MFA</label>
                <input
                  id="sa-lock-enroll-code"
                  className="sa-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value)}
                  placeholder="000000"
                  required
                />
              </div>
              <LoadingButton
                type="submit"
                loading={busy}
                className="sa-btn sa-btn-primary sa-lock-submit"
                style={{ width: '100%', display: 'flex' }}
              >
                אשר והפעל MFA
              </LoadingButton>
            </form>
          </div>
        ) : null}

        {phase === 'challenge' ? (
          <div className="sa-lock-stack">
            <p className="sa-muted">הזן קוד MFA מהאפליקציה ({status?.email})</p>
            <form className="sa-form-stack sa-lock-form" onSubmit={(e) => void confirmChallenge(e)}>
              <div className="sa-field">
                <label htmlFor="sa-lock-challenge-code">קוד MFA</label>
                <input
                  id="sa-lock-challenge-code"
                  className="sa-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={challengeCode}
                  onChange={(e) => setChallengeCode(e.target.value)}
                  placeholder="000000"
                  required
                  autoFocus
                />
              </div>
              <LoadingButton
                type="submit"
                loading={busy}
                className="sa-btn sa-btn-primary sa-lock-submit"
                style={{ width: '100%', display: 'flex' }}
              >
                אימות
              </LoadingButton>
            </form>
            <button
              type="button"
              className="sa-btn sa-btn-ghost sa-lock-submit"
              disabled={busy}
              onClick={() => void startChallenge()}
            >
              קבל אתגר חדש
            </button>
          </div>
        ) : null}

        {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}

        {phase !== 'sign_in' && phase !== 'loading' ? (
          <div className="sa-lock-setup">
            <button type="button" className="sa-btn sa-btn-ghost sa-lock-submit" onClick={() => void signOut()}>
              יציאה
            </button>
          </div>
        ) : null}

        <div className="sa-lock-setup">
          <a href="/superadmin/setup">הקמת לקוח חדש</a>
        </div>
      </div>

      {/* Scoped lock-screen layout — survives global label/button quirks on mobile */}
      <style jsx global>{`
        .sa-lock-card {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 14px !important;
          width: 100% !important;
          max-width: 400px !important;
          box-sizing: border-box !important;
        }
        .sa-lock-stack,
        .sa-lock-form.sa-form-stack,
        .sa-lock-card .sa-form-stack {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 12px !important;
          width: 100% !important;
          margin: 0 !important;
        }
        .sa-lock-card .sa-field {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 6px !important;
          width: 100% !important;
        }
        .sa-lock-card .sa-field > label {
          display: block !important;
          width: 100% !important;
          margin: 0 !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          color: #374151 !important;
        }
        .sa-lock-card .sa-field .sa-input,
        .sa-lock-card input.sa-input {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          min-height: 48px !important;
          margin: 0 !important;
          border: 1.5px solid #e5e7eb !important;
          border-radius: 12px !important;
          padding: 12px 14px !important;
          font-size: 16px !important;
          background: #fff !important;
          color: #1c2430 !important;
        }
        .sa-lock-card .sa-lock-submit,
        .sa-lock-card .sa-btn {
          display: flex !important;
          width: 100% !important;
          box-sizing: border-box !important;
          min-height: 48px !important;
          justify-content: center !important;
          align-items: center !important;
        }
        .sa-lock-qr {
          display: flex !important;
          justify-content: center !important;
          margin: 4px 0 !important;
        }
        .sa-lock-backup {
          word-break: break-all !important;
          font-size: 12px !important;
        }
        .sa-lock-setup {
          margin-top: 4px !important;
          text-align: center !important;
        }
        .sa-lock-setup a {
          font-size: 14px !important;
          color: #0b3d91 !important;
        }
      `}</style>
    </div>
  )
}
