'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast, asyncHandler, validateResponse } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { LoadingSpinner } from '../components/ui'

type ProjectRow = {
  id: string
  name: string
  project_code: string
  client_id?: string
}

function IntakePageContent() {
  const searchParams = useSearchParams()
  const paramProjectCode = (searchParams.get('project') || '').toUpperCase()
  const clientFromUrl = (searchParams.get('client') || '').trim()
  const effectiveClientId = useMemo(() => {
    if (clientFromUrl) return clientFromUrl
    if (process.env.NODE_ENV === 'development') {
      return (process.env.NEXT_PUBLIC_BAMAKOR_CLIENT_ID || '').trim()
    }
    return ''
  }, [clientFromUrl])

  const [project, setProject] = useState<ProjectRow | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [apartmentNumber, setApartmentNumber] = useState('')
  const [email, setEmail] = useState('')
  const [isRenter, setIsRenter] = useState(false)
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadProject() {
      setLoadingProject(true)
      try {
        await asyncHandler(
          async () => {
            if (!effectiveClientId || !paramProjectCode) {
              setProject(null)
              return
            }
            const url = new URL('/api/public/projects', window.location.origin)
            url.searchParams.set('client_id', effectiveClientId)
            url.searchParams.set('project', paramProjectCode)
            const res = await fetchWithTimeout(url.toString())
            if (!res.ok) {
              const j = await res.json().catch(() => ({}))
              throw new Error((j as { error?: string }).error || 'טעינת הבניין נכשלה')
            }
            const j = (await res.json()) as { projects?: ProjectRow[] }
            setProject(j.projects?.[0] || null)
          },
          { context: 'טעינת בניין', showErrorToast: false }
        )
      } finally {
        setLoadingProject(false)
      }
    }
    loadProject()
  }, [effectiveClientId, paramProjectCode])

  const canSubmit =
    !!effectiveClientId &&
    !!paramProjectCode &&
    !!project &&
    fullName.trim().length >= 2 &&
    phone.trim().length >= 9 &&
    apartmentNumber.trim().length >= 1 &&
    !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const result = await asyncHandler(
      async () => {
        const response = await fetchWithTimeout('/api/public/resident-intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: effectiveClientId,
            project_code: paramProjectCode,
            full_name: fullName.trim(),
            phone: phone.trim(),
            apartment_number: apartmentNumber.trim(),
            email: email.trim(),
            is_renter: isRenter,
          }),
        })
        await validateResponse(response, 'שליחת הטופס נכשלה')
        return (await response.json()) as { updated?: boolean }
      },
      {
        context: 'שליחת סקר דיירים',
        showErrorToast: false,
        onError: (error) => setErrorMessage(error),
      }
    )

    if (result) {
      const msg = result.updated
        ? 'הפרטים עודכנו בהצלחה. תודה!'
        : 'נרשמתם בהצלחה. תודה!'
      setSuccessMessage(msg)
      toast.success(msg)
      setFullName('')
      setPhone('')
      setApartmentNumber('')
      setEmail('')
      setIsRenter(false)
    }

    setLoading(false)
  }

  return (
    <main style={styles.page} dir="rtl">
      <div style={styles.wrapper}>
        <div style={styles.brandRow}>
          <div style={styles.logoBox}>B</div>
          <div>
            <div style={styles.brandTitle}>Bamakor</div>
            <div style={styles.brandSubtitle}>רישום דייר לבניין</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.headerBlock}>
            <h1 style={styles.title}>סקר דיירים קצר</h1>
            <p style={styles.subtitle}>
              חמש שאלות בלבד — כדי שנוכל לעדכן את פרטי הקשר שלכם במערכת התחזוקה.
            </p>
          </div>

          {loadingProject ? (
            <div style={{ padding: '12px 0', color: '#6B7280', fontSize: 14 }} aria-busy>
              טוען בניין…
            </div>
          ) : project ? (
            <div style={styles.projectInfo}>
              <span style={styles.projectLabel}>בניין</span>
              <span style={styles.projectValue}>{project.name}</span>
            </div>
          ) : (
            <div style={styles.errorBox} role="alert">
              {!effectiveClientId || !paramProjectCode
                ? 'יש לפתוח את הקישור המלא שקיבלתם מהנהלת הבניין (כולל מזהה לקוח וקוד בניין).'
                : 'הבניין לא נמצא או שאינו פעיל. בדקו את הקישור או פנו להנהלה.'}
            </div>
          )}

          {successMessage && <div style={styles.successBox}>{successMessage}</div>}
          {errorMessage && <div style={styles.errorBox}>{errorMessage}</div>}

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label htmlFor="fullName" style={styles.label}>
                1. שם מלא
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="ישראל ישראלי"
                style={styles.input}
                autoComplete="name"
                required
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="phone" style={styles.label}>
                2. טלפון נייד
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
                placeholder="0501234567"
                style={{ ...styles.input, direction: 'ltr', textAlign: 'left' }}
                autoComplete="tel"
                inputMode="tel"
                required
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="apartment" style={styles.label}>
                3. מספר דירה
              </label>
              <input
                id="apartment"
                type="text"
                value={apartmentNumber}
                onChange={(e) => setApartmentNumber(e.target.value)}
                placeholder="12"
                style={styles.input}
                required
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="email" style={styles.label}>
                4. אימייל (אופציונלי)
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                style={{ ...styles.input, direction: 'ltr', textAlign: 'left' }}
                autoComplete="email"
              />
            </div>

            <div style={styles.field}>
              <span style={styles.label}>5. סוג מגורים</span>
              <div style={styles.radioRow} role="radiogroup" aria-label="סוג מגורים">
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="residency"
                    checked={!isRenter}
                    onChange={() => setIsRenter(false)}
                  />
                  בעלים
                </label>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="residency"
                    checked={isRenter}
                    onChange={() => setIsRenter(true)}
                  />
                  שוכר
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.submitButton,
                opacity: !canSubmit ? 0.6 : 1,
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'שולח…' : 'שליחה'}
            </button>
          </form>

          <div style={styles.footerNote}>
            הפרטים ישמשו את הנהלת הבניין לעדכונים ותיאום תחזוקה בלבד.
          </div>
        </div>
      </div>
    </main>
  )
}

export default function IntakePage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <IntakePageContent />
    </Suspense>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: '100dvh',
    overflow: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    background: 'linear-gradient(180deg, #F5F6F8 0%, #EEF1F4 100%)',
    fontFamily: 'Heebo, Assistant, Arial, Helvetica, sans-serif',
    padding: '32px 16px',
    paddingTop: 'calc(32px + env(safe-area-inset-top))',
    color: '#111827',
  },
  wrapper: {
    maxWidth: '560px',
    margin: '0 auto',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  logoBox: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #C1121F 0%, #8F0B16 100%)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: '18px',
  },
  brandTitle: {
    fontSize: '20px',
    fontWeight: 800,
  },
  brandSubtitle: {
    fontSize: '13px',
    color: '#6B7280',
  },
  card: {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '24px',
    padding: '24px',
    boxShadow: '0 12px 30px rgba(17, 24, 39, 0.06)',
  },
  headerBlock: {
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 800,
    lineHeight: 1.15,
  },
  subtitle: {
    margin: '10px 0 0 0',
    color: '#6B7280',
    fontSize: '15px',
    lineHeight: 1.6,
  },
  projectInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '14px',
    background: '#F9FAFB',
    border: '1px solid #E5E7EB',
    marginBottom: '18px',
    flexWrap: 'wrap',
  },
  projectLabel: {
    fontSize: '13px',
    color: '#6B7280',
    fontWeight: 700,
  },
  projectValue: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#111827',
  },
  form: {
    display: 'grid',
    gap: '18px',
  },
  field: {
    display: 'grid',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid #D1D5DB',
    background: '#FFFFFF',
    fontSize: '15px',
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
    minHeight: '44px',
  },
  radioRow: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  radioLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#111827',
    cursor: 'pointer',
  },
  submitButton: {
    background: '#111827',
    color: '#FFFFFF',
    border: '1px solid #111827',
    borderRadius: '12px',
    padding: '14px 18px',
    fontSize: '15px',
    fontWeight: 800,
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBox: {
    background: '#ECFDF5',
    color: '#166534',
    border: '1px solid #BBF7D0',
    borderRadius: '12px',
    padding: '14px 16px',
    marginBottom: '16px',
    fontWeight: 600,
  },
  errorBox: {
    background: '#FEF2F2',
    color: '#B91C3C',
    border: '1px solid #FECACA',
    borderRadius: '12px',
    padding: '14px 16px',
    marginBottom: '16px',
    fontWeight: 600,
  },
  footerNote: {
    marginTop: '18px',
    fontSize: '13px',
    color: '#6B7280',
    lineHeight: 1.6,
  },
}
