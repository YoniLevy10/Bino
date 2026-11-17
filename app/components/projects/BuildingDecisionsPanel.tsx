'use client'

/**
 * Building Hub — החלטות tab (Wave 4 / PR-C + PR-D notify + PR-I summary).
 * Majority uses eligible unit denominator; threshold editable; notify + summary/reminders.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { DECISION_STATUS_LABELS_HE } from '@/lib/building-governance/roles'
import type { DecisionSummaryPayload } from '@/lib/building-governance/decision-summary'
import { openDecisionSummaryPrint } from '@/lib/building-governance/decision-summary-print'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'
import { WhatsAppBuildingShareButton } from '@/app/components/shared/WhatsAppBuildingShareButton'
import {
  absoluteBuildingDecisionInviteUrl,
  buildBuildingDecisionShareMessage,
} from '@/lib/whatsapp-building-share'

type SignatureRequest = {
  id: string
  signer_name: string
  signer_phone: string | null
  status: string
  signed_at: string | null
  sign_path: string
  resident_id?: string | null
  /** @deprecated prefer sign_path + client origin */
  sign_url?: string
}

function absoluteSignUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  if (typeof window !== 'undefined') return `${window.location.origin}${pathOrUrl}`
  return pathOrUrl
}

type Decision = {
  id: string
  title: string
  body: string | null
  status: string
  majority_threshold: number
  required_signatures: number
  signed_count: number
  approve_count?: number
  oppose_count?: number
  abstain_count?: number
  majority_reached: boolean
  majority_pct: number
  majority_need?: number
  created_at: string
  signature_requests: SignatureRequest[]
}

type EligibleVoters = {
  count: number
  unit_count: number
  mapped_resident_count: number
  basis: string
}

type Props = {
  projectId: string
  projectName: string
  /** projects.whatsapp_group_invite_url */
  groupInviteUrl?: string | null
  onGroupInviteSaved?: (url: string | null) => void
  isMobile?: boolean
}

function thresholdToPercentInput(threshold: number): string {
  const pct = Math.round(Number(threshold) * 100)
  if (!Number.isFinite(pct) || pct <= 0) return '50'
  return String(Math.min(100, Math.max(1, pct)))
}

function percentInputToThreshold(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0.5
  return Math.min(1, Math.max(0.01, n / 100))
}

export function BuildingDecisionsPanel({
  projectId,
  projectName,
  groupInviteUrl = null,
  onGroupInviteSaved,
  isMobile: isMobileProp,
}: Props) {
  const [viewportMobile, setViewportMobile] = useState(false)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [eligible, setEligible] = useState<EligibleVoters | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [localGroupInvite, setLocalGroupInvite] = useState<string | null>(
    groupInviteUrl ?? null
  )

  useEffect(() => {
    setLocalGroupInvite(groupInviteUrl ?? null)
  }, [groupInviteUrl, projectId])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [required, setRequired] = useState('2')
  const [thresholdPct, setThresholdPct] = useState('50')
  const [signerName, setSignerName] = useState('')
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null)
  const [notifyingId, setNotifyingId] = useState<string | null>(null)
  const [editThresholdById, setEditThresholdById] = useState<Record<string, string>>({})
  const [summaryById, setSummaryById] = useState<Record<string, DecisionSummaryPayload>>({})
  const [summaryOpenId, setSummaryOpenId] = useState<string | null>(null)
  const [summaryLoadingId, setSummaryLoadingId] = useState<string | null>(null)
  const [remindLoadingId, setRemindLoadingId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof isMobileProp === 'boolean') return
    const check = () => setViewportMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [isMobileProp])

  const isMobile = typeof isMobileProp === 'boolean' ? isMobileProp : viewportMobile

  const load = useCallback(async () => {
    setLoading(true)
    setMissingTable(false)
    try {
      const res = await fetchWithTimeout(
        `/api/building-governance/decisions?project_id=${encodeURIComponent(projectId)}`
      )
      const json = (await res.json()) as {
        decisions?: Decision[]
        eligible_voters?: EligibleVoters
        error?: string
      }
      if (!res.ok) {
        const msg = errorMessageFromResponseJson(json, `שגיאה ${res.status}`)
        if (/relation|does not exist|schema cache|building_decision/i.test(msg)) {
          setMissingTable(true)
          setDecisions([])
          return
        }
        throw new Error(msg)
      }
      const list = json.decisions ?? []
      setDecisions(list)
      const ev = json.eligible_voters ?? null
      setEligible(ev)
      if (ev && ev.count > 0) {
        setRequired(String(ev.count))
      }
      const nextEdit: Record<string, string> = {}
      for (const d of list) {
        nextEdit[d.id] = thresholdToPercentInput(d.majority_threshold)
      }
      setEditThresholdById(nextEdit)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת החלטות נכשלה')
      setDecisions([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('נא להזין כותרת החלטה')
      return
    }
    const eligibleCount = eligible?.count ?? 0
    if (eligibleCount === 0) {
      const reqN = Math.max(1, Math.min(500, Number(required) || 0))
      if (!reqN) {
        toast.error('אין דירות זכאיות — יש להזין ידנית מספר חתימות נדרש')
        return
      }
    }
    const reqN = Math.max(1, Math.min(500, Number(required) || 1))
    const majorityThreshold = percentInputToThreshold(thresholdPct)
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          body: body.trim() || null,
          required_signatures: reqN,
          majority_threshold: majorityThreshold,
          status: 'open',
        }),
      })
      const json = (await res.json()) as {
        error?: string
        decision?: { id: string }
        eligible_warning?: string | null
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      if (json.eligible_warning) toast.error(json.eligible_warning)
      else toast.success('החלטה נוצרה')
      setTitle('')
      setBody('')
      setActiveDecisionId(json.decision?.id ?? null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'יצירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function saveThreshold(decisionId: string) {
    const raw = editThresholdById[decisionId]
    const majorityThreshold = percentInputToThreshold(raw ?? '50')
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/decisions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          decision_id: decisionId,
          majority_threshold: majorityThreshold,
        }),
      })
      const json = (await res.json()) as { error?: string; eligible_warning?: string | null }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      if (json.eligible_warning) toast.error(json.eligible_warning)
      else toast.success('סף הרוב עודכן')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'עדכון נכשל')
    } finally {
      setSaving(false)
    }
  }

  async function addSigner(decisionId: string) {
    if (!signerName.trim()) {
      toast.error('נא להזין שם חותם')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/decisions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          decision_id: decisionId,
          signer_name: signerName.trim(),
        }),
      })
      const json = (await res.json()) as { error?: string; sign_path?: string; sign_url?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      const link = json.sign_path
        ? absoluteSignUrl(json.sign_path)
        : json.sign_url
          ? absoluteSignUrl(json.sign_url)
          : null
      if (link) {
        try {
          await navigator.clipboard.writeText(link)
          toast.success('קישור חתימה נוצר והועתק')
        } catch {
          toast.success('קישור חתימה נוצר')
        }
      }
      setSignerName('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'יצירת קישור נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('הקישור הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  async function notifyResidents(decisionId: string) {
    setNotifyingId(decisionId)
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/decisions/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          decision_id: decisionId,
          all_residents: true,
          channels: ['sms'],
          send_messages: true,
        }),
      })
      const json = (await res.json()) as {
        error?: string
        created?: number
        attempted?: number
        sms_sent?: number
        hint?: string | null
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      const created = Number(json.created ?? 0)
      const attempted = Number(json.attempted ?? 0)
      const smsSent = Number(json.sms_sent ?? 0)
      const base =
        created > 0
          ? `נוצרה בקשת חתימה ל־${created} דיירים באזור האישי`
          : attempted > 0
            ? 'לא נוצרו בקשות חדשות (ייתכן שכבר נשלח)'
            : 'לא נמצאו דיירים לשליחה'
      toast.success(smsSent > 0 ? `${base} · SMS: ${smsSent}` : base)
      if (json.hint) toast.info(json.hint)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שליחה לדיירים נכשלה')
    } finally {
      setNotifyingId(null)
      setSaving(false)
    }
  }

  async function loadSummary(decisionId: string, opts?: { print?: boolean }) {
    setSummaryLoadingId(decisionId)
    try {
      const res = await fetchWithTimeout(
        `/api/building-governance/decisions/summary?project_id=${encodeURIComponent(projectId)}&decision_id=${encodeURIComponent(decisionId)}`
      )
      const json = (await res.json()) as {
        summary?: DecisionSummaryPayload
        error?: string
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      if (!json.summary) throw new Error('סיכום ריק')
      setSummaryById((prev) => ({ ...prev, [decisionId]: json.summary! }))
      setSummaryOpenId(decisionId)
      if (opts?.print) {
        const ok = openDecisionSummaryPrint(json.summary)
        if (!ok) toast.error('חסימת חלון הדפסה — אפשרו pop-up')
        else toast.success('סיכום מוכן להדפסה / PDF')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'טעינת סיכום נכשלה')
    } finally {
      setSummaryLoadingId(null)
    }
  }

  async function sendReminders(decisionId: string) {
    setRemindLoadingId(decisionId)
    try {
      const res = await fetchWithTimeout('/api/building-governance/decisions/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          decision_id: decisionId,
          channels: ['sms', 'email'],
        }),
      })
      const json = (await res.json()) as {
        error?: string
        sms_sent?: number
        email_sent?: number
        wa_session_sent?: number
        wa_skipped_outside_session?: number
        attempted?: number
        hint?: string | null
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      const parts = [
        `תזכורות: ${json.attempted ?? 0}`,
        `SMS ${json.sms_sent ?? 0}`,
        `אימייל ${json.email_sent ?? 0}`,
        `WA ${json.wa_session_sent ?? 0}`,
      ]
      toast.success(parts.join(' · '))
      if (json.hint) toast.info(json.hint)
      if (summaryOpenId === decisionId) {
        await loadSummary(decisionId)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שליחת תזכורות נכשלה')
    } finally {
      setRemindLoadingId(null)
    }
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <LoadingSpinner />
      </div>
    )
  }

  if (missingTable) {
    return (
      <div style={styles.lockBox}>
        <p style={styles.lockTitle}>החלטות וחתימות</p>
        <p style={styles.lockBody}>
          יש להחיל את המיגרציה{' '}
          <code>supabase/migrations/133_building_governance_wave4.sql</code> במסד ואז לרענן.
        </p>
      </div>
    )
  }

  const eligibleCount = eligible?.count ?? 0
  const showManualRequired = eligibleCount === 0

  return (
    <div style={styles.root}>
      <p style={styles.intro}>
        החלטות ל־<strong>{projectName}</strong> — המכנה הוא מספר דירות עם דייר ממופה
        {eligibleCount > 0 ? ` (${eligibleCount})` : ''}. רוב נספר רק מחתימות דיירים מזוהים.
        סף הרוב ניתן להגדרה לכל החלטה.
      </p>

      {showManualRequired ? (
        <p style={styles.warn} role="status">
          לא נמצאו דירות עם דייר ממופה — יש להזין ידנית את מספר החתימות הנדרש.
        </p>
      ) : (
        <p style={styles.meta} role="status">
          זכאים: {eligibleCount} דירות · יחידות: {eligible?.unit_count ?? 0} · דיירים ממופים:{' '}
          {eligible?.mapped_resident_count ?? 0}
        </p>
      )}

      <form onSubmit={onCreate} style={styles.form}>
        <label style={styles.label}>
          כותרת ההחלטה
          <input
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
            maxLength={300}
            required
          />
        </label>
        <label style={styles.label}>
          פירוט (אופציונלי)
          <textarea
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            style={{
              ...styles.input,
              minHeight: 72,
              resize: 'vertical',
              ...(isMobile ? styles.inputMobile : null),
            }}
            maxLength={8000}
          />
        </label>
        <label style={styles.label}>
          סף רוב (%)
          <input
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            value={thresholdPct}
            onChange={(ev) => setThresholdPct(ev.target.value)}
            style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
          />
        </label>
        {showManualRequired ? (
          <label style={styles.label}>
            מספר חתימות נדרש (ידני — אין זכאים ממופים)
            <input
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              value={required}
              onChange={(ev) => setRequired(ev.target.value)}
              style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
            />
          </label>
        ) : (
          <p style={styles.meta}>
            מכנה אוטומטי ביצירה: {eligibleCount}. סף: {thresholdPct}% → כ־
            {Math.ceil(eligibleCount * percentInputToThreshold(thresholdPct))} חתימות דיירים.
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
          style={isMobile ? styles.fullBtn : undefined}
        >
          {saving ? 'שומר…' : 'יצירת החלטה'}
        </Button>
      </form>

      {decisions.length === 0 ? (
        <p style={styles.empty}>אין עדיין החלטות — צרו את הראשונה למעלה</p>
      ) : (
        <div style={styles.list}>
          {decisions.map((d) => (
            <div key={d.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardTitle}>{d.title}</span>
                <span style={styles.status}>
                  {DECISION_STATUS_LABELS_HE[d.status] || d.status}
                </span>
              </div>
              {d.body ? <p style={styles.bodyText}>{d.body}</p> : null}
              <p style={styles.progress}>
                בעד: {d.approve_count ?? d.signed_count}/{d.required_signatures}
                {typeof d.oppose_count === 'number' ? ` · נגד: ${d.oppose_count}` : ''}
                {typeof d.abstain_count === 'number' ? ` · נמנע: ${d.abstain_count}` : ''}{' '}
                · התקדמות לרוב: {d.majority_pct}%
                {d.majority_reached ? ' · הושג רוב' : ''}
                {' · '}
                סף {Math.round(Number(d.majority_threshold) * 100)}%
              </p>

              {(d.status === 'open' || d.status === 'draft') && (
                <div
                  style={{
                    ...styles.addSigner,
                    ...(isMobile ? styles.addSignerMobile : null),
                  }}
                >
                  <label style={{ ...styles.label, flex: 1, margin: 0 }}>
                    סף רוב (%)
                    <input
                      type="number"
                      min={1}
                      max={100}
                      inputMode="numeric"
                      value={
                        editThresholdById[d.id] ??
                        thresholdToPercentInput(d.majority_threshold)
                      }
                      onChange={(ev) =>
                        setEditThresholdById((prev) => ({ ...prev, [d.id]: ev.target.value }))
                      }
                      style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size={isMobile ? 'md' : 'sm'}
                    disabled={saving}
                    onClick={() => void saveThreshold(d.id)}
                    style={isMobile ? styles.fullBtn : undefined}
                  >
                    שמירת סף
                  </Button>
                </div>
              )}

              <div
                style={{
                  ...styles.actionsRow,
                  ...(isMobile ? styles.actionsRowMobile : null),
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size={isMobile ? 'md' : 'sm'}
                  disabled={summaryLoadingId === d.id}
                  onClick={() => void loadSummary(d.id)}
                  style={isMobile ? styles.fullBtn : undefined}
                >
                  {summaryLoadingId === d.id
                    ? 'טוען סיכום…'
                    : summaryOpenId === d.id
                      ? 'רענון סיכום'
                      : 'סיכום החלטה'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size={isMobile ? 'md' : 'sm'}
                  disabled={summaryLoadingId === d.id}
                  onClick={() => void loadSummary(d.id, { print: true })}
                  style={isMobile ? styles.fullBtn : undefined}
                >
                  הדפסה / PDF
                </Button>
                {(d.status === 'open' || d.status === 'draft') &&
                (d.signature_requests || []).some((s) => s.status === 'pending') ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size={isMobile ? 'md' : 'sm'}
                    disabled={remindLoadingId === d.id || saving}
                    onClick={() => void sendReminders(d.id)}
                    style={isMobile ? styles.fullBtn : undefined}
                  >
                    {remindLoadingId === d.id ? 'שולח תזכורות…' : 'תזכורת לחתימה'}
                  </Button>
                ) : null}
              </div>

              {summaryOpenId === d.id && summaryById[d.id] ? (
                <DecisionSummaryInline summary={summaryById[d.id]} isMobile={isMobile} />
              ) : null}

              {(d.signature_requests || []).length > 0 ? (
                <div style={styles.sigList}>
                  {d.signature_requests.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        ...styles.sigRow,
                        ...(isMobile ? styles.sigRowMobile : null),
                      }}
                    >
                      <span style={styles.sigName}>
                        {s.signer_name}
                        {s.resident_id ? '' : ' (לא נספר לרוב)'} —{' '}
                        {s.status === 'signed'
                          ? 'נחתם'
                          : s.status === 'pending'
                            ? 'ממתין'
                            : s.status}
                      </span>
                      {s.status === 'pending' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size={isMobile ? 'md' : 'sm'}
                          onClick={() =>
                            void copyUrl(absoluteSignUrl(s.sign_path || s.sign_url || ''))
                          }
                          style={isMobile ? styles.fullBtn : undefined}
                        >
                          העתקת קישור
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {(d.status === 'open' || d.status === 'draft') && (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size={isMobile ? 'md' : 'sm'}
                    disabled={saving || notifyingId === d.id}
                    onClick={() => void notifyResidents(d.id)}
                    style={isMobile ? styles.fullBtn : undefined}
                  >
                    {notifyingId === d.id ? 'שולח…' : 'שליחה לאזור אישי'}
                  </Button>
                  <div style={styles.waShareBlock}>
                    <WhatsAppBuildingShareButton
                      projectId={projectId}
                      groupInviteUrl={localGroupInvite}
                      shareMessage={buildBuildingDecisionShareMessage({
                        projectName,
                        decisionTitle: d.title,
                        inviteUrl: absoluteBuildingDecisionInviteUrl({
                          projectId,
                          decisionId: d.id,
                        }),
                      })}
                      onGroupInviteSaved={(url) => {
                        setLocalGroupInvite(url)
                        onGroupInviteSaved?.(url)
                      }}
                      size={isMobile ? 'md' : 'sm'}
                      fullWidth={isMobile}
                      shareLabel="שיתוף לקבוצת וואטסאפ"
                    />
                  </div>
                  <div
                    style={{
                      ...styles.addSigner,
                      ...(isMobile ? styles.addSignerMobile : null),
                    }}
                  >
                    <input
                      value={activeDecisionId === d.id ? signerName : ''}
                      onFocus={() => setActiveDecisionId(d.id)}
                      onChange={(ev) => {
                        setActiveDecisionId(d.id)
                        setSignerName(ev.target.value)
                      }}
                      placeholder="שם החותם (קישור ציבורי — לא נספר לרוב בלי דייר)"
                      style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
                      maxLength={200}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size={isMobile ? 'md' : 'sm'}
                      disabled={saving || activeDecisionId !== d.id}
                      onClick={() => void addSigner(d.id)}
                      style={isMobile ? styles.fullBtn : undefined}
                    >
                      קישור חתימה
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={styles.hint}>
        רוב = חתימות דיירים מזוהים ÷ דירות זכאיות ≥ סף. חתימות אנונימיות נשמרות לביקורת אך לא
        נספרות. תזכורות: SMS/אימייל. WhatsApp חופשי רק בחלון 24 שעות; מחוץ לחלון נדרשת תבנית
        UTILITY מאושרת (HSM) — עדיין לא בקטלוג governance.
      </p>
    </div>
  )
}

function DecisionSummaryInline({
  summary,
  isMobile,
}: {
  summary: DecisionSummaryPayload
  isMobile: boolean
}) {
  return (
    <div style={styles.summaryBox}>
      <p style={styles.summaryTitle}>סיכום החלטה</p>
      <p style={styles.progress}>
        בעד {summary.votes.approve} · נגד {summary.votes.oppose} · נמנע{' '}
        {summary.votes.abstain} · ממתין {summary.votes.pending}
      </p>
      <p style={styles.progress}>
        {summary.majority_pct}% מול סף {Math.round(summary.majority_threshold * 100)}% (
        {summary.majority_need}/{summary.required_signatures})
        {summary.majority_reached ? ' · הושג רוב' : ''}
      </p>
      {summary.pdf.download_url ? (
        <p style={styles.progress}>
          PDF:{' '}
          <a href={summary.pdf.download_url} target="_blank" rel="noopener noreferrer">
            {summary.pdf.file_name || 'פתיחת מסמך'}
          </a>
        </p>
      ) : (
        <p style={styles.progress}>PDF: לא צורף מסמך להחלטה</p>
      )}
      <div style={styles.summarySigners}>
        {summary.signers.slice(0, isMobile ? 8 : 12).map((s) => (
          <span key={s.id} style={styles.summaryChip}>
            {s.signer_name}
            {s.effective_choice
              ? ` · ${
                  s.effective_choice === 'approve'
                    ? 'בעד'
                    : s.effective_choice === 'oppose'
                      ? 'נגד'
                      : 'נמנע'
                }`
              : s.status === 'pending'
                ? ' · ממתין'
                : ''}
            {s.signed_at ? ` · ${new Date(s.signed_at).toLocaleDateString('he-IL')}` : ''}
          </span>
        ))}
      </div>
      {summary.audit_refs.length > 0 ? (
        <p style={styles.progress}>
          audit: {summary.audit_refs.slice(0, 4).map((a) => a.action).join(' · ')}
          {summary.audit_refs.length > 4 ? '…' : ''}
        </p>
      ) : (
        <p style={styles.progress}>audit: אין עדיין רשומות להחלטה</p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: theme.spacing.lg },
  center: { display: 'flex', justifyContent: 'center', padding: 40 },
  waShareBlock: {
    marginTop: 4,
  },
  intro: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  meta: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    lineHeight: 1.45,
  },
  warn: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.warning,
    background: theme.colors.warningMuted,
    borderRadius: theme.radius.md,
    padding: '10px 12px',
    lineHeight: 1.45,
  },
  form: {
    display: 'grid',
    gap: 10,
    padding: theme.spacing.lg,
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
  },
  label: {
    display: 'grid',
    gap: 6,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 44,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontFamily: 'inherit',
    fontSize: theme.typography.fontSize.sm,
  },
  inputMobile: {
    fontSize: 16,
    minHeight: 48,
  },
  fullBtn: {
    width: '100%',
    minHeight: 48,
  },
  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    alignItems: 'center',
  },
  actionsRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  summaryBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '10px 12px',
    background: theme.colors.background,
    borderRadius: theme.radius.md,
    border: `1px dashed ${theme.colors.border}`,
  },
  summaryTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  summarySigners: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  summaryChip: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    padding: '4px 8px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 14px',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
  },
  cardTitle: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.fontSize.sm,
    wordBreak: 'break-word' as const,
    minWidth: 0,
    flex: 1,
  },
  status: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    whiteSpace: 'nowrap',
  },
  bodyText: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
  progress: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
  },
  sigList: { display: 'flex', flexDirection: 'column', gap: 4 },
  sigRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  sigRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  sigName: {
    wordBreak: 'break-word' as const,
    minWidth: 0,
  },
  addSigner: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    marginTop: 4,
  },
  addSignerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  empty: {
    margin: 0,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.sm,
    padding: '16px 0',
  },
  hint: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    lineHeight: 1.45,
  },
  lockBox: {
    padding: theme.spacing.xl,
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px dashed ${theme.colors.borderStrong}`,
    textAlign: 'center',
  },
  lockTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  lockBody: {
    margin: '10px 0 0',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
}
