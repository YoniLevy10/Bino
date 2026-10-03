'use client'

import { useEffect, useState } from 'react'
import { LoadingButton } from '@/app/components/LoadingButton'
import { adminHeaders } from '@/app/superadmin/helpers'
import {
  activityTypeLabelHe,
  contactOutcomeLabelHe,
  CONTACT_OUTCOMES,
  INTEREST_LEVELS,
  interestLabelHe,
  LEAD_STAGES,
  LOST_REASONS,
  lostReasonLabelHe,
  stageLabelHe,
} from '@/lib/sales-leads/funnel/model'
import { formatJerusalemDateTime } from '@/lib/sales-leads/funnel/timezone'
import type {
  InterestLevel,
  LeadStage,
  SalesLead,
  SalesLeadActivity,
  SalesLeadTask,
  SalesOperatorLite,
} from '@/lib/sales-leads/types'

type Props = {
  lead: SalesLead
  secret?: string
  operatorId: string
  operators: SalesOperatorLite[]
  onClose: () => void
  onLeadUpdated: (lead: SalesLead) => void
  onConflict: (lead: SalesLead | null, message: string) => void
}

export function LeadDetailDrawer({
  lead,
  secret,
  operatorId,
  operators,
  onClose,
  onLeadUpdated,
  onConflict,
}: Props) {
  const [activities, setActivities] = useState<SalesLeadActivity[]>([])
  const [tasks, setTasks] = useState<SalesLeadTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [noteDraft, setNoteDraft] = useState('')
  const [summaryDraft, setSummaryDraft] = useState(lead.summary ?? '')
  const [stage, setStage] = useState<LeadStage>(lead.status)
  const [interest, setInterest] = useState<InterestLevel>(lead.interestLevel)
  const [ownerId, setOwnerId] = useState(lead.ownerOperatorId ?? '')
  const [nextTitle, setNextTitle] = useState(lead.nextActionTitle ?? 'מעקב')
  const [nextDueLocal, setNextDueLocal] = useState('')
  const [lostReason, setLostReason] = useState(lead.lostReason ?? '')
  const [lostDetail, setLostDetail] = useState(lead.lostReasonDetail ?? '')
  const [deferredUntil, setDeferredUntil] = useState('')
  const [setupFee, setSetupFee] = useState(
    lead.estimatedSetupFeeIls != null ? String(lead.estimatedSetupFeeIls) : '',
  )
  const [mrr, setMrr] = useState(
    lead.estimatedMrrIls != null ? String(lead.estimatedMrrIls) : '',
  )
  const [contactOutcome, setContactOutcome] = useState('no_answer')
  const [contactBody, setContactBody] = useState('')
  const [waitingForReply, setWaitingForReply] = useState(lead.waitingForReply)
  const [version, setVersion] = useState(lead.version)
  const [followUpTitle, setFollowUpTitle] = useState('מעקב')
  const [followUpDue, setFollowUpDue] = useState('')

  useEffect(() => {
    setSummaryDraft(lead.summary ?? '')
    setStage(lead.status)
    setInterest(lead.interestLevel)
    setOwnerId(lead.ownerOperatorId ?? '')
    setNextTitle(lead.nextActionTitle ?? 'מעקב')
    setLostReason(lead.lostReason ?? '')
    setLostDetail(lead.lostReasonDetail ?? '')
    setSetupFee(lead.estimatedSetupFeeIls != null ? String(lead.estimatedSetupFeeIls) : '')
    setMrr(lead.estimatedMrrIls != null ? String(lead.estimatedMrrIls) : '')
    setWaitingForReply(lead.waitingForReply)
    setVersion(lead.version)
  }, [lead])

  useEffect(() => {
    let cancelled = false
    async function loadDetail() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(
          `/api/superadmin/sales-leads/${lead.id}?include=activities,tasks`,
          { headers: adminHeaders(operatorId) },
        )
        const json = (await res.json()) as {
          lead?: SalesLead
          activities?: SalesLeadActivity[]
          tasks?: SalesLeadTask[]
          error?: string
        }
        if (!res.ok) throw new Error(json.error || 'טעינת כרטיס נכשלה')
        if (cancelled) return
        if (json.lead) {
          onLeadUpdated(json.lead)
          setVersion(json.lead.version)
        }
        setActivities(json.activities ?? [])
        setTasks(json.tasks ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאה')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadDetail()
    return () => {
      cancelled = true
    }
    // intentionally only reload when lead id / auth context changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, operatorId])

  async function patch(body: Record<string, unknown>): Promise<SalesLead | null> {
    setSaveState('saving')
    setError('')
    const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
      method: 'PATCH',
      headers: {
        ...adminHeaders(operatorId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, expectedVersion: version }),
    })
    const json = (await res.json()) as {
      lead?: SalesLead
      error?: string
      code?: string
    }
    if (res.status === 409) {
      setSaveState('error')
      onConflict(json.lead ?? null, json.error || 'הליד השתנה')
      if (json.lead) {
        onLeadUpdated(json.lead)
        setVersion(json.lead.version)
      }
      return null
    }
    if (!res.ok) {
      setSaveState('error')
      throw new Error(json.error || 'שמירה נכשלה')
    }
    if (json.lead) {
      onLeadUpdated(json.lead)
      setVersion(json.lead.version)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
      return json.lead
    }
    setSaveState('error')
    return null
  }

  async function saveCore() {
    try {
      const payload: Record<string, unknown> = {
        status: stage,
        interestLevel: interest,
        ownerOperatorId: ownerId || null,
        summary: summaryDraft.trim() || null,
        waitingForReply,
        nextActionTitle: nextTitle.trim() || 'מעקב',
      }
      if (nextDueLocal.trim()) {
        // datetime-local is wall clock; send as-is ISO-ish — server stores timestamptz
        payload.nextActionAt = new Date(nextDueLocal).toISOString()
      }
      if (stage === 'lost') {
        payload.lostReason = lostReason || null
        payload.lostReasonDetail = lostDetail || null
      }
      if (stage === 'deferred' && deferredUntil.trim()) {
        payload.deferredUntil = new Date(deferredUntil).toISOString()
      }
      if (setupFee.trim() === '') payload.estimatedSetupFeeIls = null
      else {
        const n = Number(setupFee)
        if (!Number.isFinite(n)) throw new Error('דמי הקמה לא תקינים')
        payload.estimatedSetupFeeIls = Math.round(n)
      }
      if (mrr.trim() === '') payload.estimatedMrrIls = null
      else {
        const n = Number(mrr)
        if (!Number.isFinite(n)) throw new Error('MRR לא תקין')
        payload.estimatedMrrIls = Math.round(n)
      }
      await patch(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setSaveState('error')
    }
  }

  async function addNote() {
    if (!noteDraft.trim()) return
    setSaveState('saving')
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          ...adminHeaders(operatorId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add_activity',
          activityType: 'note',
          body: noteDraft.trim(),
          expectedVersion: version,
        }),
      })
      const json = (await res.json()) as {
        lead?: SalesLead
        activity?: SalesLeadActivity
        error?: string
        code?: string
      }
      if (res.status === 409) {
        onConflict(json.lead ?? null, json.error || 'הליד השתנה')
        setSaveState('error')
        return
      }
      if (!res.ok) throw new Error(json.error || 'הוספת הערה נכשלה')
      if (json.lead) {
        onLeadUpdated(json.lead)
        setVersion(json.lead.version)
      }
      if (json.activity) setActivities((prev) => [json.activity!, ...prev])
      setNoteDraft('')
      setSaveState('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setSaveState('error')
    }
  }

  async function logContact(type: 'phone_attempt' | 'call' | 'whatsapp') {
    setSaveState('saving')
    try {
      const nextStageAfterContact =
        contactOutcome === 'conversation_held' ? 'conversation_held' : undefined
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          ...adminHeaders(operatorId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add_activity',
          activityType: type,
          body: contactBody.trim() || null,
          outcome: contactOutcome,
          touchesContact: contactOutcome !== 'no_answer',
          setStage: nextStageAfterContact,
          expectedVersion: version,
        }),
      })
      const json = (await res.json()) as {
        lead?: SalesLead
        activity?: SalesLeadActivity
        error?: string
      }
      if (res.status === 409) {
        onConflict(json.lead ?? null, json.error || 'הליד השתנה')
        setSaveState('error')
        return
      }
      if (!res.ok) throw new Error(json.error || 'תיעוד קשר נכשל')
      if (json.lead) {
        onLeadUpdated(json.lead)
        setVersion(json.lead.version)
        setStage(json.lead.status)
      }
      if (json.activity) setActivities((prev) => [json.activity!, ...prev])
      setContactBody('')
      setSaveState('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setSaveState('error')
    }
  }

  async function completeTask(taskId: string) {
    setSaveState('saving')
    try {
      const followUp =
        followUpTitle.trim() && followUpDue.trim()
          ? {
              followUpTitle: followUpTitle.trim(),
              followUpDueAt: new Date(followUpDue).toISOString(),
            }
          : {}
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          ...adminHeaders(operatorId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'complete_task', taskId, ...followUp }),
      })
      const json = (await res.json()) as {
        lead?: SalesLead
        task?: SalesLeadTask
        error?: string
      }
      if (!res.ok) throw new Error(json.error || 'השלמת משימה נכשלה')
      if (json.lead) {
        onLeadUpdated(json.lead)
        setVersion(json.lead.version)
      }
      const detailRes = await fetch(
        `/api/superadmin/sales-leads/${lead.id}?include=activities,tasks`,
        { headers: adminHeaders(operatorId) },
      )
      const detail = (await detailRes.json()) as {
        activities?: SalesLeadActivity[]
        tasks?: SalesLeadTask[]
      }
      setActivities(detail.activities ?? [])
      setTasks(detail.tasks ?? [])
      setSaveState('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setSaveState('error')
    }
  }

  const displayName = lead.businessName || lead.name
  const saveLabel =
    saveState === 'saving'
      ? 'שומר…'
      : saveState === 'saved'
        ? 'נשמר'
        : saveState === 'error'
          ? 'שגיאה בשמירה'
          : 'שמור שינויים'

  return (
    <aside className="sa-lead-drawer" dir="rtl" aria-label={`כרטיס ליד ${displayName}`}>
      <div className="sa-lead-drawer-head">
        <div>
          <h2>{displayName}</h2>
          <p className="sa-muted">
            {lead.name !== displayName ? `${lead.name} · ` : ''}
            {lead.city} · v{version}
            {lead.updatedBy ? ` · עודכן ע״י ${lead.updatedBy.displayName}` : ''}
            {lead.updatedAt
              ? ` · ${formatJerusalemDateTime(lead.updatedAt) ?? ''}`
              : ''}
          </p>
        </div>
        <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>
          סגור
        </button>
      </div>

      {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}

      <div className="sa-lead-drawer-grid">
        <label>
          שלב מכירה
          <select value={stage} onChange={(e) => setStage(e.target.value as LeadStage)}>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {stageLabelHe(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          רמת עניין
          <select
            value={interest}
            onChange={(e) => setInterest(e.target.value as InterestLevel)}
          >
            {INTEREST_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {interestLabelHe(lvl)}
              </option>
            ))}
          </select>
        </label>
        <label>
          אחראי
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">ללא אחראי</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="sa-check-inline">
          <input
            type="checkbox"
            checked={waitingForReply}
            onChange={(e) => setWaitingForReply(e.target.checked)}
          />
          ממתין לתשובה
        </label>
      </div>

      {stage === 'lost' ? (
        <div className="sa-lead-drawer-grid">
          <label>
            סיבת הפסד
            <select value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
              <option value="">בחרו סיבה</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {lostReasonLabelHe(r)}
                </option>
              ))}
            </select>
          </label>
          {lostReason === 'other' || lostReason ? (
            <label>
              פירוט
              <input value={lostDetail} onChange={(e) => setLostDetail(e.target.value)} />
            </label>
          ) : null}
        </div>
      ) : null}

      {stage === 'deferred' ? (
        <label>
          תאריך חזרה
          <input
            type="datetime-local"
            value={deferredUntil}
            onChange={(e) => setDeferredUntil(e.target.value)}
          />
        </label>
      ) : null}

      <label>
        תקציר מצב
        <textarea
          rows={3}
          value={summaryDraft}
          onChange={(e) => setSummaryDraft(e.target.value)}
          placeholder="מה המצב עכשיו במשפט-שניים"
        />
      </label>

      <div className="sa-lead-drawer-grid">
        <label>
          פעולה הבאה
          <input value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} />
        </label>
        <label>
          מועד ביצוע
          <input
            type="datetime-local"
            value={nextDueLocal}
            onChange={(e) => setNextDueLocal(e.target.value)}
          />
        </label>
        <label>
          דמי הקמה צפויים (₪)
          <input
            inputMode="numeric"
            value={setupFee}
            onChange={(e) => setSetupFee(e.target.value)}
            placeholder="ריק = לא ידוע"
          />
        </label>
        <label>
          הכנסה חודשית צפויה (₪)
          <input
            inputMode="numeric"
            value={mrr}
            onChange={(e) => setMrr(e.target.value)}
            placeholder="ריק = לא ידוע"
          />
        </label>
      </div>

      <div className="sa-lead-drawer-actions">
        <LoadingButton
          type="button"
          loading={saveState === 'saving'}
          className="sa-btn sa-btn-primary"
          onClick={() => void saveCore()}
        >
          {saveLabel}
        </LoadingButton>
        <span className="sa-muted">
          קשר אחרון:{' '}
          {formatJerusalemDateTime(lead.lastContactAt) ?? 'טרם תועד קשר בפועל'}
        </span>
      </div>

      <section className="sa-lead-section">
        <h3>תיעוד קשר</h3>
        <p className="sa-muted">
          &quot;לא ענה&quot; אינו משנה רמת עניין. פתיחת WhatsApp אינה נחשבת שליחה.
        </p>
        <div className="sa-lead-drawer-grid">
          <label>
            תוצאה
            <select
              value={contactOutcome}
              onChange={(e) => setContactOutcome(e.target.value)}
            >
              {CONTACT_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {contactOutcomeLabelHe(o)}
                </option>
              ))}
            </select>
          </label>
          <label>
            הערה
            <input value={contactBody} onChange={(e) => setContactBody(e.target.value)} />
          </label>
        </div>
        <div className="sa-lead-actions">
          <button
            type="button"
            className="sa-btn sa-btn-ghost"
            onClick={() => void logContact('phone_attempt')}
          >
            ניסיון טלפון
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-ghost"
            onClick={() => void logContact('call')}
          >
            שיחה
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-ghost"
            onClick={() => void logContact('whatsapp')}
          >
            סמן WhatsApp נשלח
          </button>
        </div>
      </section>

      <section className="sa-lead-section">
        <h3>הערה חדשה</h3>
        <textarea
          rows={3}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="הערות נשמרות בנפרד — לא דורסות זו את זו"
        />
        <button type="button" className="sa-btn sa-btn-ghost" onClick={() => void addNote()}>
          הוסף הערה
        </button>
      </section>

      <section className="sa-lead-section">
        <h3>משימות</h3>
        {loading ? <p className="sa-muted">טוען…</p> : null}
        <ul className="sa-lead-timeline">
          {tasks.map((t) => (
            <li key={t.id}>
              <strong>
                {t.status === 'open' ? 'פתוחה' : t.status === 'done' ? 'הושלמה' : 'בוטלה'}
              </strong>
              {' · '}
              {t.title} · {formatJerusalemDateTime(t.dueAt)}
              {t.status === 'open' ? (
                <button
                  type="button"
                  className="sa-btn sa-btn-ghost"
                  onClick={() => void completeTask(t.id)}
                >
                  השלם
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="sa-lead-drawer-grid">
          <label>
            המשך אחרי השלמה
            <input value={followUpTitle} onChange={(e) => setFollowUpTitle(e.target.value)} />
          </label>
          <label>
            מועד המשך
            <input
              type="datetime-local"
              value={followUpDue}
              onChange={(e) => setFollowUpDue(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="sa-lead-section">
        <h3>ציר זמן</h3>
        <ul className="sa-lead-timeline">
          {activities.map((a) => (
            <li key={a.id}>
              <div className="sa-lead-timeline-meta">
                <strong>{activityTypeLabelHe(a.activityType)}</strong>
                <span>
                  {a.actorLabel} · {formatJerusalemDateTime(a.createdAt)}
                  {a.editedAt ? ' · נערך' : ''}
                </span>
              </div>
              {a.outcome ? (
                <div className="sa-muted">{contactOutcomeLabelHe(a.outcome)}</div>
              ) : null}
              {a.body ? <p>{a.body}</p> : null}
            </li>
          ))}
          {!loading && activities.length === 0 ? (
            <li className="sa-muted">אין פעילויות עדיין</li>
          ) : null}
        </ul>
      </section>

      <section className="sa-lead-section sa-muted">
        <div>טלפון: {lead.phone || '—'}</div>
        <div>אימייל: {lead.email || '—'}</div>
        <div>מקור: {lead.sourceName}</div>
        {lead.legacyStatus ? <div>סטטוס ישן: {lead.legacyStatus}</div> : null}
        {lead.outreachAngle ? <div>זווית: {lead.outreachAngle}</div> : null}
      </section>
    </aside>
  )
}
