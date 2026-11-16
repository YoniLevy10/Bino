'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import {
  ResidentAlert,
  ResidentAuthFrame,
  ResidentMuted,
  ResidentPageTitle,
  ResidentPrimaryButton,
  residentTheme,
} from '@/app/components/resident/residentUi'

type UnlockStatus = { unlocked?: boolean }

export default function ResidentDemoLoginPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/public/resident-portal/demo-login')
        const json = (await res.json()) as UnlockStatus
        if (!cancelled) setUnlocked(Boolean(json.unlocked))
      } catch {
        if (!cancelled) setUnlocked(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function enterDemo() {
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/public/resident-portal/demo-login', { method: 'POST' })
      const json = (await res.json()) as {
        error?: string
        token_hash?: string
        resident_name?: string
        project_name?: string
      }
      if (!res.ok) {
        setError(json.error || 'כניסת QA נכשלה')
        return
      }
      if (!json.token_hash) {
        setError('תגובת שרת חסרה פרטי התחברות')
        return
      }

      const supabase = createClient()
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: json.token_hash,
        type: 'magiclink',
      })
      if (vErr) {
        const retry = await supabase.auth.verifyOtp({
          token_hash: json.token_hash,
          type: 'email',
        })
        if (retry.error) {
          setError(retry.error.message || vErr.message || 'יצירת סשן נכשלה')
          return
        }
      }

      setInfo(
        `נכנסתם כ־${json.resident_name || 'דייר DEMO'} · ${json.project_name || 'בניין QA'}`
      )
      // Full navigation so auth cookies settle before /resident data fetches.
      window.location.assign('/resident')
      return
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ResidentAuthFrame brandName="BINO">
      <ResidentPageTitle>כניסת QA לפורטל דיירים</ResidentPageTitle>
      <ResidentMuted style={{ margin: '10px 0 18px' }}>
        נתיב פרטי לשרת פיתוח בלבד — יוצר סשן לדייר DEMO בבניין QA Hub (סביון) בלי SMS. לא פעיל
        בפרודקשן.
      </ResidentMuted>

      {unlocked === false ? (
        <ResidentAlert tone="error">
          כבוי. הוסיפו <code>RESIDENT_PORTAL_DEV_UNLOCK=true</code> ל־.env.local והפעילו מחדש את
          השרת המקומי.
        </ResidentAlert>
      ) : null}

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <ResidentAlert tone="error">{error}</ResidentAlert>
        </div>
      ) : null}
      {info ? (
        <div style={{ marginBottom: 12 }}>
          <ResidentAlert tone="info">{info}</ResidentAlert>
        </div>
      ) : null}

      <ResidentPrimaryButton
        type="button"
        disabled={loading || unlocked === false}
        onClick={() => void enterDemo()}
      >
        {loading ? 'נכנסים…' : unlocked === null ? 'בודקים…' : 'כניסה כדייר DEMO'}
      </ResidentPrimaryButton>

      <p style={{ marginTop: 16, fontSize: 13, color: residentTheme.colors.textMuted }}>
        או קישור בניין:{' '}
        <Link href="/resident/join/401b99be-4706-4b44-aa7b-6b5a8587ee27" style={{ color: 'inherit' }}>
          /resident/join/…DEMO QA Hub
        </Link>{' '}
        · טלפון <span dir="ltr">0500000101</span> (עם unlock — קוד בלי SMS)
      </p>
    </ResidentAuthFrame>
  )
}
