'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
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

export default function ResidentJoinPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = useMemo(() => {
    const raw = params?.projectId
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  }, [params])

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function requestCode(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/public/resident-portal/phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, phone }),
      })
      const json = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) {
        setError(json.error || 'שליחת סיסמה נכשלה')
        return
      }
      setInfo(json.message || 'אם המספר רשום, נשלחה סיסמה מספרית ב-SMS')
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/public/resident-portal/phone-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, phone, code }),
      })
      const json = (await res.json()) as {
        error?: string
        email?: string
        token_hash?: string
      }
      if (!res.ok) {
        setError(json.error || 'אימות נכשל')
        return
      }
      if (!json.email || !json.token_hash) {
        setError('תגובת שרת חסרה פרטי התחברות')
        return
      }

      const supabase = createClient()
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: json.email,
        token_hash: json.token_hash,
        type: 'email',
      })
      if (vErr) {
        setError(vErr.message || 'יצירת סשן נכשלה')
        return
      }
      router.replace('/resident')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  if (!projectId) {
    return (
      <div dir="rtl" style={{ padding: 24, color: residentTheme.colors.textMuted }}>
        קישור לא תקין
      </div>
    )
  }

  return (
    <div
      className="resident-shell"
      style={{ ...residentShellStyles.root, justifyContent: 'center' }}
      dir="rtl"
    >
      <ResidentAmbientWash />
      <div
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
          <ResidentPageTitle>כניסה לאזור האישי</ResidentPageTitle>
          <ResidentMuted style={{ margin: '8px 0 20px' }}>
            הזינו את מספר הטלפון הרשום אצל חברת הניהול. נשלח אליכם ב-SMS סיסמה מספרית חד־פעמית
            שמשתנה בכל כניסה.
          </ResidentMuted>

          {step === 'phone' ? (
            <form onSubmit={requestCode}>
              <label style={residentShellStyles.label}>טלפון נייד</label>
              <ResidentField
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                placeholder="050-0000000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ marginBottom: 16 }}
              />
              {error ? (
                <div style={{ marginBottom: 12 }}>
                  <ResidentAlert tone="error">{error}</ResidentAlert>
                </div>
              ) : null}
              {info ? (
                <div style={{ marginBottom: 12 }}>
                  <ResidentAlert tone="success">{info}</ResidentAlert>
                </div>
              ) : null}
              <ResidentPrimaryButton type="submit" disabled={loading}>
                {loading ? 'שולח…' : 'שלחו סיסמה ב-SMS'}
              </ResidentPrimaryButton>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              <ResidentMuted style={{ marginBottom: 8 }}>סיסמה נשלחה אל {phone}</ResidentMuted>
              <label style={residentShellStyles.label}>סיסמה מ-SMS (מספרים בלבד)</label>
              <ResidentField
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ marginBottom: 16, letterSpacing: '0.2em', fontWeight: 700 }}
              />
              {error ? (
                <div style={{ marginBottom: 12 }}>
                  <ResidentAlert tone="error">{error}</ResidentAlert>
                </div>
              ) : null}
              <ResidentPrimaryButton type="submit" disabled={loading || code.length !== 6}>
                {loading ? 'מאמת…' : 'כניסה'}
              </ResidentPrimaryButton>
              <button
                type="button"
                onClick={() => {
                  setStep('phone')
                  setCode('')
                  setError('')
                  setInfo('')
                }}
                style={{
                  ...residentShellStyles.headerAction,
                  width: '100%',
                  marginTop: 8,
                  minHeight: 44,
                }}
              >
                שינוי מספר / שליחה מחדש
              </button>
            </form>
          )}
        </ResidentCard>
      </div>
    </div>
  )
}
