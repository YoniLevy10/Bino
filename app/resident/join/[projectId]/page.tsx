'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import {
  ResidentAlert,
  ResidentAuthFrame,
  ResidentField,
  ResidentMuted,
  ResidentOtpBoxes,
  ResidentPageTitle,
  ResidentPrimaryButton,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

/** Only allow in-app resident portal redirects (open-redirect safe). */
function safeResidentNext(raw: string | null): string | null {
  if (!raw) return null
  const path = raw.trim()
  if (!path.startsWith('/resident')) return null
  if (path.startsWith('//') || path.includes('://')) return null
  if (path.length > 300) return null
  return path
}

type JoinMeta = {
  project?: { name?: string | null }
  client?: { name?: string | null; logo_url?: string | null }
}

function ResidentJoinInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const nextPath = useMemo(
    () => safeResidentNext(searchParams.get('next')),
    [searchParams]
  )
  const projectId = useMemo(() => {
    const raw = params?.projectId
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
  }, [params])

  const [meta, setMeta] = useState<JoinMeta | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/public/resident-portal/join-meta?project_id=${encodeURIComponent(projectId)}`
        )
        const json = (await res.json()) as JoinMeta & { error?: string }
        if (cancelled || !res.ok) return
        setMeta(json)
      } catch {
        /* branding is optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

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
      const json = (await res.json()) as {
        error?: string
        message?: string
        dev_code?: string
      }
      if (!res.ok) {
        setError(json.error || 'שליחת סיסמה נכשלה')
        return
      }
      if (json.dev_code) {
        setCode(json.dev_code)
        setInfo(`קוד QA (ללא SMS): ${json.dev_code}`)
      } else {
        setInfo(json.message || 'נשלחה סיסמה מספרית ב-SMS. בדקו גם במסוננים / הודעות לא רצויות.')
      }
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
      if (!json.token_hash) {
        setError('תגובת שרת חסרה פרטי התחברות')
        return
      }

      // Server issues a magiclink hashed_token. Supabase requires ONLY
      // { token_hash, type } — passing email returns:
      // "Only the token_hash and type should be provided".
      const supabase = createClient()
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: json.token_hash,
        type: 'magiclink',
      })
      if (vErr) {
        // Fallback for older Auth versions that expect type "email".
        const retry = await supabase.auth.verifyOtp({
          token_hash: json.token_hash,
          type: 'email',
        })
        if (retry.error) {
          setError(retry.error.message || vErr.message || 'יצירת סשן נכשלה')
          return
        }
      }
      // Full navigation so auth cookies settle before portal data fetches.
      window.location.assign(nextPath || '/resident')
      return
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
    <ResidentAuthFrame
      brandName={meta?.client?.name}
      buildingName={meta?.project?.name}
      logoUrl={meta?.client?.logo_url}
    >
      <ResidentPageTitle>כניסה לאזור האישי</ResidentPageTitle>
      <ResidentMuted style={{ margin: '10px 0 22px' }}>
        הזינו את מספר הטלפון הרשום אצל חברת הניהול. בכל כניסה נשלחת סיסמה מספרית חד־פעמית.
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
            dir="ltr"
          />
          {error ? (
            <div style={{ marginBottom: 12 }}>
              <ResidentAlert tone="error">{error}</ResidentAlert>
            </div>
          ) : null}
          <ResidentPrimaryButton type="submit" disabled={loading}>
            {loading ? 'שולח…' : 'שלחו סיסמה ב-SMS'}
          </ResidentPrimaryButton>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <ResidentAlert tone="info">
            {info || 'נשלחה סיסמה ב-SMS. בדקו גם במסוננים / הודעות לא רצויות.'}
          </ResidentAlert>
          <label style={{ ...residentShellStyles.label, marginTop: 18 }}>סיסמה מ-SMS</label>
          <ResidentOtpBoxes value={code} onChange={setCode} disabled={loading} />
          {error ? (
            <div style={{ margin: '12px 0' }}>
              <ResidentAlert tone="error">{error}</ResidentAlert>
            </div>
          ) : (
            <div style={{ height: 12 }} />
          )}
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
              marginTop: 10,
              minHeight: 44,
            }}
          >
            שינוי מספר / שליחה מחדש
          </button>
        </form>
      )}
    </ResidentAuthFrame>
  )
}

export default function ResidentJoinPage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" style={{ padding: 24, color: residentTheme.colors.textMuted }}>
          טוען…
        </div>
      }
    >
      <ResidentJoinInner />
    </Suspense>
  )
}
