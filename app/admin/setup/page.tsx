/**
 * /admin/setup — ויזארד פנימי להקמת לקוח חדש
 *
 * @description
 * טופס פנימי (Yoni בלבד) להקמת לקוח חדש תוך פחות מדקה.
 * שלב 1 — מסך נעילה: הזנת ADMIN_SETUP_SECRET (משתנה סביבה ב-Vercel).
 * שלב 2 — טופס: שם חברה, תכנית, WhatsApp, מנהל, פרויקטים, עובדים.
 * שלב 3 — תוצאות: client_id, הזמנה נשלחה, קישורי QR לכל פרויקט.
 *
 * קריאה: POST /api/admin/setup-client עם header x-admin-secret.
 *
 * @route /admin/setup
 * @access פנימי — מוגן ב-ADMIN_SETUP_SECRET
 */
'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import { theme, Button, Card } from '../../components/ui'
import { LoadingButton } from '../../components/LoadingButton'
import { readAdminSecret, writeAdminSecret } from '@/lib/admin-secret-session'
import { PLAN_SETUP_OPTIONS, planLimitsLine } from '@/lib/plan-display'
import type { PlanTier } from '@/lib/plan-limits'

// ─── Types ────────────────────────────────────────────────────────────────────
type ProjectInput = { name: string; project_code: string; address: string }
type WorkerInput = { full_name: string; phone: string; email: string; role: string }

type SetupResult = {
  ok: boolean
  client_id: string
  organization_id: string
  admin_email: string
  invite_sent: boolean
  workers_created: number
  logo_url?: string | null
  logo_upload_error?: string | null
  projects: Array<{
    id: string
    name: string
    project_code: string
    whatsapp_qr_url: string | null
    report_url: string | null
  }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyProject(): ProjectInput {
  return { name: '', project_code: '', address: '' }
}
function emptyWorker(): WorkerInput {
  return { full_name: '', phone: '', email: '', role: '' }
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, '') // strip Excel BOM
  const firstLine = clean.split('\n')[0] ?? ''
  const delimiter = firstLine.includes(';') ? ';' : ','
  return clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const cols: string[] = []
      let cur = ''
      let inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ }
        else if (ch === delimiter && !inQ) { cols.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      cols.push(cur.trim())
      return cols
    })
}

function looksLikeHeader(row: string[]): boolean {
  const keywords = ['שם', 'name', 'קוד', 'code', 'כתובת', 'address', 'טלפון', 'phone', 'full_name', 'תפקיד', 'role', 'אימייל', 'email']
  return row.some((c) => keywords.some((k) => c.toLowerCase().includes(k)))
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function AdminQuickLinks() {
  const linkStyle: CSSProperties = {
    color: theme.colors.primary,
    textDecoration: 'none',
    fontSize: theme.typography.fontSize.xs,
  }
  return (
    <div style={{ marginTop: theme.spacing.lg, textAlign: 'center' }}>
      <a href="/superadmin" style={linkStyle}>Super Admin</a>
      <span style={{ color: theme.colors.textMuted, margin: '0 6px' }}>·</span>
      <a href="/admin/setup" style={linkStyle}>הקמת לקוח</a>
    </div>
  )
}

// ─── Small UI primitives ──────────────────────────────────────────────────────
function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label
        style={{
          display: 'block',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}
        {required && <span style={{ color: theme.colors.error, marginRight: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: theme.typography.fontSize.base,
  border: `1.5px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  outline: 'none',
  background: theme.colors.surface,
  color: theme.colors.textPrimary,
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
  direction: 'rtl',
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, cursor: 'pointer' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.textPrimary,
        margin: `0 0 ${theme.spacing.xl}`,
        paddingBottom: theme.spacing.md,
        borderBottom: `1.5px solid ${theme.colors.borderSubtle}`,
      }}
    >
      {children}
    </h2>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminSetupPage() {
  // Auth
  const [secret, setSecret] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  // Form state
  const [companyName, setCompanyName] = useState('')
  const [planTier, setPlanTier] = useState<'starter' | 'pro' | 'business' | 'enterprise'>('starter')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPhone, setAdminPhone] = useState('')
  const [waPhoneId, setWaPhoneId] = useState('')
  const [waBusinessPhone, setWaBusinessPhone] = useState('')
  const [projects, setProjects] = useState<ProjectInput[]>([emptyProject()])
  const [workers, setWorkers] = useState<WorkerInput[]>([emptyWorker()])
  const [logoFile, setLogoFile] = useState<File | null>(null)

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SetupResult | null>(null)
  const [csvMsgProjects, setCsvMsgProjects] = useState('')
  const [csvMsgWorkers, setCsvMsgWorkers] = useState('')

  // ── Unlock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = readAdminSecret()
    if (!stored) return
    setSecret(stored)
    setUnlocked(true)
  }, [])

  function handleUnlock() {
    if (!secret.trim()) {
      setUnlockError('הכנס קוד גישה')
      return
    }
    writeAdminSecret(secret.trim())
    setUnlocked(true)
    setUnlockError('')
  }

  // ── Projects ──────────────────────────────────────────────────────────────
  function updateProject(i: number, field: keyof ProjectInput, val: string) {
    setProjects((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)))
  }
  function addProject() {
    setProjects((prev) => [...prev, emptyProject()])
  }
  function removeProject(i: number) {
    setProjects((prev) => prev.filter((_, idx) => idx !== i))
  }

  // ── Workers ───────────────────────────────────────────────────────────────
  function updateWorker(i: number, field: keyof WorkerInput, val: string) {
    setWorkers((prev) => prev.map((w, idx) => (idx === i ? { ...w, [field]: val } : w)))
  }
  function addWorker() {
    setWorkers((prev) => [...prev, emptyWorker()])
  }
  function removeWorker(i: number) {
    setWorkers((prev) => prev.filter((_, idx) => idx !== i))
  }

  // ── CSV upload ────────────────────────────────────────────────────────────
  async function handleProjectsCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = parseCsvRows(text)
    const data = looksLikeHeader(rows[0] ?? []) ? rows.slice(1) : rows
    const parsed: ProjectInput[] = data
      .filter((r) => r[0] && r[1])
      .map((r) => ({ name: r[0] ?? '', project_code: (r[1] ?? '').toUpperCase(), address: r[2] ?? '' }))
    if (parsed.length === 0) { setCsvMsgProjects('לא נמצאו שורות תקינות (נדרש: שם, קוד)'); e.target.value = ''; return }
    setProjects(parsed)
    setCsvMsgProjects(`✓ נטענו ${parsed.length} פרויקטים`)
    e.target.value = ''
  }

  async function handleWorkersCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = parseCsvRows(text)
    const data = looksLikeHeader(rows[0] ?? []) ? rows.slice(1) : rows
    const parsed: WorkerInput[] = data
      .filter((r) => r[0] && r[1])
      .map((r) => ({ full_name: r[0] ?? '', phone: r[1] ?? '', email: r[2] ?? '', role: r[3] ?? '' }))
    if (parsed.length === 0) { setCsvMsgWorkers('לא נמצאו שורות תקינות (נדרש: שם, טלפון)'); e.target.value = ''; return }
    setWorkers(parsed)
    setCsvMsgWorkers(`✓ נטענו ${parsed.length} עובדים`)
    e.target.value = ''
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError('')
    if (!companyName.trim()) { setError('חסר שם חברה'); return }
    if (!adminEmail.trim()) { setError('חסר אימייל מנהל'); return }
    if (projects.some((p) => !p.name.trim() || !p.project_code.trim())) {
      setError('כל פרויקט חייב שם וקוד')
      return
    }

    const filteredWorkers = workers.filter((w) => w.full_name.trim() && w.phone.trim())

    setLoading(true)
    try {
      const res = await fetch('/api/admin/setup-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret,
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          plan_tier: planTier,
          admin_email: adminEmail.trim(),
          admin_phone: adminPhone.trim() || undefined,
          whatsapp_phone_number_id: waPhoneId.trim() || undefined,
          whatsapp_business_phone: waBusinessPhone.trim() || undefined,
          projects: projects.map((p) => ({
            name: p.name.trim(),
            project_code: p.project_code.trim().toUpperCase(),
            address: p.address.trim() || undefined,
          })),
          workers: filteredWorkers.map((w) => ({
            full_name: w.full_name.trim(),
            phone: w.phone.trim(),
            email: w.email.trim() || undefined,
            role: w.role.trim() || undefined,
          })),
        }),
      })

      const data: unknown = await res.json()
      if (!res.ok) {
        const msg =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as Record<string, unknown>).error)
            : `שגיאה ${res.status}`
        setError(msg)
      } else {
        const setupResult = data as SetupResult
        if (logoFile) {
          const form = new FormData()
          form.append('file', logoFile)
          form.append('client_id', setupResult.client_id)
          try {
            const logoRes = await fetch('/api/admin/upload-client-logo', {
              method: 'POST',
              headers: { 'x-admin-secret': secret },
              body: form,
            })
            const logoJson = (await logoRes.json().catch(() => ({}))) as { url?: string; error?: string }
            if (!logoRes.ok || !logoJson.url) {
              setupResult.logo_upload_error = logoJson.error || `שגיאה ${logoRes.status}`
            } else {
              setupResult.logo_url = logoJson.url
            }
          } catch (e) {
            setupResult.logo_upload_error = e instanceof Error ? e.message : 'העלאת לוגו נכשלה'
          }
        }
        setResult(setupResult)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const pageStyle: CSSProperties = {
    minHeight: '100vh',
    background: theme.colors.background,
    display: 'flex',
    justifyContent: 'center',
    padding: `${theme.spacing.xxxl} ${theme.spacing.xl}`,
    direction: 'rtl',
  }
  const containerStyle: CSSProperties = {
    width: '100%',
    maxWidth: 780,
  }
  const cardStyle: CSSProperties = {
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xxl,
    boxShadow: theme.shadows.md,
    marginBottom: theme.spacing.xl,
  }
  const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing.lg,
  }
  const dynamicRowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr auto',
    gap: theme.spacing.md,
    alignItems: 'end',
    marginBottom: theme.spacing.md,
  }
  const workerRowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
    gap: theme.spacing.md,
    alignItems: 'end',
    marginBottom: theme.spacing.md,
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lock screen
  // ─────────────────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div style={pageStyle}>
        <div style={{ ...containerStyle, maxWidth: 400, marginTop: 80 }}>
          <div style={cardStyle}>
            <h1
              style={{
                fontSize: theme.typography.fontSize['2xl'],
                fontWeight: theme.typography.fontWeight.bold,
                marginBottom: theme.spacing.xl,
                textAlign: 'center',
                color: theme.colors.textPrimary,
              }}
            >
              הגדרת לקוח חדש
            </h1>
            <Field label="קוד גישה" required>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder="הכנס קוד גישה..."
                style={inputStyle}
              />
            </Field>
            {unlockError && (
              <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.md }}>
                {unlockError}
              </p>
            )}
            <LoadingButton onClick={handleUnlock} style={{ width: '100%' }}>
              כניסה
            </LoadingButton>
            <AdminQuickLinks />
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Results screen
  // ─────────────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div
            style={{
              ...cardStyle,
              borderTop: `4px solid ${theme.colors.success}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.xl }}>
              <span style={{ fontSize: 32 }}>✅</span>
              <div>
                <h2 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.textPrimary }}>
                  הלקוח הוקם בהצלחה!
                </h2>
                <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: theme.typography.fontSize.sm }}>
                  נשלחה הזמנה ל-{result.admin_email}
                </p>
              </div>
            </div>

            {result.logo_url ? (
              <div
                style={{
                  marginBottom: theme.spacing.xl,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  background: theme.colors.successMuted,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.textPrimary,
                }}
              >
                לוגו הועלה בהצלחה.
              </div>
            ) : null}
            {result.logo_upload_error ? (
              <div
                style={{
                  marginBottom: theme.spacing.xl,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  background: theme.colors.warningMuted,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.textPrimary,
                }}
              >
                הלקוח נוצר, אך העלאת הלוגו נכשלה: {result.logo_upload_error}
                {' — '}
                ניתן להעלות מ-Super Admin אחר כך.
              </div>
            ) : null}

            {/* IDs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md, marginBottom: theme.spacing.xl }}>
              {[
                { label: 'Client ID', value: result.client_id },
                { label: 'Organization ID', value: result.organization_id },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: theme.colors.muted,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.lg,
                    cursor: 'pointer',
                  }}
                  onClick={() => copyToClipboard(item.value)}
                  title="לחץ להעתקה"
                >
                  <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <code style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.textPrimary, wordBreak: 'break-all' }}>
                    {item.value}
                  </code>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: theme.spacing.lg, marginBottom: theme.spacing.xl, flexWrap: 'wrap' }}>
              {[
                { label: 'פרויקטים', value: result.projects.length },
                { label: 'עובדים', value: result.workers_created },
                { label: 'הזמנה נשלחה', value: result.invite_sent ? 'כן ✓' : 'לא' },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: theme.colors.primaryMuted,
                    borderRadius: theme.radius.md,
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.primary }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Projects table */}
            <h3 style={{ fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.md, color: theme.colors.textPrimary }}>
              קישורי QR לפרויקטים
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.fontSize.sm }}>
                <thead>
                  <tr style={{ background: theme.colors.muted }}>
                    {['פרויקט', 'קוד', 'WhatsApp QR', 'קישור דיווח'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                          textAlign: 'right',
                          fontWeight: theme.typography.fontWeight.semibold,
                          color: theme.colors.textSecondary,
                          borderBottom: `1.5px solid ${theme.colors.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.projects.map((p) => (
                    <tr
                      key={p.id}
                      style={{ borderBottom: `1px solid ${theme.colors.borderSubtle}` }}
                    >
                      <td style={{ padding: `${theme.spacing.md} ${theme.spacing.md}`, color: theme.colors.textPrimary, fontWeight: theme.typography.fontWeight.medium }}>
                        {p.name}
                      </td>
                      <td style={{ padding: `${theme.spacing.md} ${theme.spacing.md}` }}>
                        <code style={{ background: theme.colors.muted, padding: '2px 8px', borderRadius: theme.radius.xs, fontSize: theme.typography.fontSize.xs }}>
                          {p.project_code}
                        </code>
                      </td>
                      <td style={{ padding: `${theme.spacing.md} ${theme.spacing.md}` }}>
                        {p.whatsapp_qr_url ? (
                          <a href={p.whatsapp_qr_url} target="_blank" rel="noreferrer" style={{ color: theme.colors.primary, textDecoration: 'none', fontSize: theme.typography.fontSize.xs }}>
                            פתח WhatsApp ↗
                          </a>
                        ) : (
                          <span style={{ color: theme.colors.textMuted, fontSize: theme.typography.fontSize.xs }}>אין מספר WA</span>
                        )}
                      </td>
                      <td style={{ padding: `${theme.spacing.md} ${theme.spacing.md}` }}>
                        {p.report_url ? (
                          <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                            <a href={p.report_url} target="_blank" rel="noreferrer" style={{ color: theme.colors.primary, textDecoration: 'none', fontSize: theme.typography.fontSize.xs }}>
                              פתח ↗
                            </a>
                            <button
                              onClick={() => copyToClipboard(p.report_url!)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textMuted, fontSize: theme.typography.fontSize.xs, padding: 0 }}
                            >
                              📋
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: theme.colors.textMuted, fontSize: theme.typography.fontSize.xs }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: theme.spacing.xl, textAlign: 'center' }}>
              <button
                onClick={() => {
                  setResult(null)
                  setCompanyName('')
                  setAdminEmail('')
                  setAdminPhone('')
                  setWaPhoneId('')
                  setWaBusinessPhone('')
                  setProjects([emptyProject()])
                  setWorkers([emptyWorker()])
                  setPlanTier('starter')
                }}
                style={{
                  background: 'none',
                  border: `1.5px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.md,
                  padding: '10px 24px',
                  cursor: 'pointer',
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                הקמת לקוח נוסף
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main form
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h1
          style={{
            fontSize: theme.typography.fontSize['3xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.textPrimary,
            marginBottom: theme.spacing.xxl,
          }}
        >
          הקמת לקוח חדש
        </h1>

        {/* ── 1. Company Info ────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionTitle>פרטי חברה</SectionTitle>
          <div style={rowStyle}>
            <Field label="שם החברה (מוצג באפליקציה)" required>
              <Input value={companyName} onChange={setCompanyName} placeholder="למשל: ועד הבית תל אביב" />
            </Field>
            <Field label="תכנית" required>
              <Select
                value={planTier}
                onChange={(v) => setPlanTier(v as typeof planTier)}
                options={PLAN_SETUP_OPTIONS}
              />
              <p
                style={{
                  margin: `${theme.spacing.xs}px 0 0`,
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.textMuted,
                  lineHeight: 1.5,
                }}
              >
                מכסות: {planLimitsLine(planTier)}
              </p>
            </Field>
          </div>
          <Field label="לוגו (אופציונלי)">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              style={{ ...inputStyle, padding: '8px 14px' }}
            />
            <p style={{ margin: `${theme.spacing.xs}px 0 0`, fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted }}>
              PNG או JPEG, עד 2MB — יוצג בסרגל ובמסך הפתיחה
            </p>
          </Field>
          <div style={rowStyle}>
            <Field label="WhatsApp Phone Number ID (Meta)">
              <Input value={waPhoneId} onChange={setWaPhoneId} placeholder="123456789012345" />
            </Field>
            <Field label="מספר WhatsApp Business (לדיירים)">
              <Input value={waBusinessPhone} onChange={setWaBusinessPhone} placeholder="972501234567" />
            </Field>
          </div>
        </div>

        {/* ── 2. Admin User ──────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionTitle>מנהל הלקוח</SectionTitle>
          <div style={rowStyle}>
            <Field label="אימייל מנהל" required>
              <Input value={adminEmail} onChange={setAdminEmail} type="email" placeholder="admin@example.com" />
            </Field>
            <Field label="טלפון מנהל">
              <Input value={adminPhone} onChange={setAdminPhone} placeholder="0501234567" />
            </Field>
          </div>
        </div>

        {/* ── 3. Projects ────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xl, paddingBottom: theme.spacing.md, borderBottom: `1.5px solid ${theme.colors.borderSubtle}` }}>
            <h2 style={{ margin: 0, fontSize: theme.typography.fontSize.lg, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.textPrimary }}>פרויקטים</h2>
            <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexShrink: 0 }}>
              {csvMsgProjects && (
                <span style={{ fontSize: theme.typography.fontSize.xs, color: csvMsgProjects.startsWith('✓') ? theme.colors.success : theme.colors.error }}>
                  {csvMsgProjects}
                </span>
              )}
              <button
                type="button"
                onClick={() => downloadCsv('תבנית-פרויקטים.csv', 'שם פרויקט,קוד,כתובת\nבניין הרצל 5,BMK001,הרצל 5 תל אביב')}
                style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.primary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                הורד תבנית
              </button>
              <label style={{ cursor: 'pointer' }}>
                <span style={{ fontSize: theme.typography.fontSize.xs, background: theme.colors.primaryMuted, color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: theme.radius.sm, padding: '4px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  העלה CSV
                </span>
                <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { void handleProjectsCsv(e) }} />
              </label>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 130px 1fr auto',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.sm,
            }}
          >
            {['שם פרויקט', 'קוד', 'כתובת', ''].map((h) => (
              <div key={h} style={{ fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.textMuted }}>
                {h}
              </div>
            ))}
          </div>
          {projects.map((p, i) => (
            <div
              key={i}
              style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr auto', gap: theme.spacing.md, alignItems: 'center', marginBottom: theme.spacing.sm }}
            >
              <input
                value={p.name}
                onChange={(e) => updateProject(i, 'name', e.target.value)}
                placeholder="שם הפרויקט"
                style={{ ...inputStyle, marginBottom: 0 }}
              />
              <input
                value={p.project_code}
                onChange={(e) => updateProject(i, 'project_code', e.target.value.toUpperCase())}
                placeholder="PROJ1"
                style={{ ...inputStyle, marginBottom: 0, fontFamily: 'monospace' }}
              />
              <input
                value={p.address}
                onChange={(e) => updateProject(i, 'address', e.target.value)}
                placeholder="כתובת (אופציונלי)"
                style={{ ...inputStyle, marginBottom: 0 }}
              />
              <button
                onClick={() => removeProject(i)}
                disabled={projects.length === 1}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: projects.length === 1 ? 'not-allowed' : 'pointer',
                  color: projects.length === 1 ? theme.colors.textMuted : theme.colors.error,
                  fontSize: 18,
                  padding: '4px 8px',
                  lineHeight: 1,
                }}
                title="הסר שורה"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addProject}
            style={{
              background: 'none',
              border: `1.5px dashed ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              padding: '8px 16px',
              cursor: 'pointer',
              color: theme.colors.primary,
              fontSize: theme.typography.fontSize.sm,
              marginTop: theme.spacing.sm,
              width: '100%',
            }}
          >
            + הוסף פרויקט
          </button>
        </div>

        {/* ── 4. Workers ─────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xl, paddingBottom: theme.spacing.md, borderBottom: `1.5px solid ${theme.colors.borderSubtle}` }}>
            <h2 style={{ margin: 0, fontSize: theme.typography.fontSize.lg, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.textPrimary }}>עובדים (אופציונלי)</h2>
            <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexShrink: 0 }}>
              {csvMsgWorkers && (
                <span style={{ fontSize: theme.typography.fontSize.xs, color: csvMsgWorkers.startsWith('✓') ? theme.colors.success : theme.colors.error }}>
                  {csvMsgWorkers}
                </span>
              )}
              <button
                type="button"
                onClick={() => downloadCsv('תבנית-עובדים.csv', 'שם מלא,טלפון,אימייל,תפקיד\nישראל ישראלי,0501234567,israel@example.com,טכנאי')}
                style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.primary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                הורד תבנית
              </button>
              <label style={{ cursor: 'pointer' }}>
                <span style={{ fontSize: theme.typography.fontSize.xs, background: theme.colors.primaryMuted, color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: theme.radius.sm, padding: '4px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  העלה CSV
                </span>
                <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { void handleWorkersCsv(e) }} />
              </label>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 130px 1fr 120px auto',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.sm,
            }}
          >
            {['שם מלא', 'טלפון', 'אימייל', 'תפקיד', ''].map((h) => (
              <div key={h} style={{ fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.textMuted }}>
                {h}
              </div>
            ))}
          </div>
          {workers.map((w, i) => (
            <div
              key={i}
              style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr 120px auto', gap: theme.spacing.md, alignItems: 'center', marginBottom: theme.spacing.sm }}
            >
              <input
                value={w.full_name}
                onChange={(e) => updateWorker(i, 'full_name', e.target.value)}
                placeholder="שם מלא"
                style={{ ...inputStyle, marginBottom: 0 }}
              />
              <input
                value={w.phone}
                onChange={(e) => updateWorker(i, 'phone', e.target.value)}
                placeholder="0501234567"
                style={{ ...inputStyle, marginBottom: 0 }}
              />
              <input
                value={w.email}
                onChange={(e) => updateWorker(i, 'email', e.target.value)}
                placeholder="אימייל (אופציונלי)"
                style={{ ...inputStyle, marginBottom: 0 }}
              />
              <input
                value={w.role}
                onChange={(e) => updateWorker(i, 'role', e.target.value)}
                placeholder="תפקיד"
                style={{ ...inputStyle, marginBottom: 0 }}
              />
              <button
                onClick={() => removeWorker(i)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.colors.error,
                  fontSize: 18,
                  padding: '4px 8px',
                  lineHeight: 1,
                }}
                title="הסר שורה"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addWorker}
            style={{
              background: 'none',
              border: `1.5px dashed ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              padding: '8px 16px',
              cursor: 'pointer',
              color: theme.colors.primary,
              fontSize: theme.typography.fontSize.sm,
              marginTop: theme.spacing.sm,
              width: '100%',
            }}
          >
            + הוסף עובד
          </button>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              background: theme.colors.errorMuted,
              border: `1.5px solid ${theme.colors.error}`,
              borderRadius: theme.radius.md,
              padding: theme.spacing.lg,
              marginBottom: theme.spacing.xl,
              color: theme.colors.error,
              fontSize: theme.typography.fontSize.sm,
              direction: 'rtl',
            }}
          >
            {error}
          </div>
        )}

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: theme.spacing.xxxl }}>
          <LoadingButton
            onClick={handleSubmit}
            loading={loading}
            loadingText="מקים לקוח..."
            size="lg"
            style={{
              padding: '16px 48px',
              boxShadow: loading ? 'none' : theme.shadows.md,
            }}
          >
            הקם לקוח
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
