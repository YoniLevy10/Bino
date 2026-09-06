'use client'

import type { ReactNode } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import { PLAN_SETUP_OPTIONS, planLimitsLine } from '@/lib/plan-display'
import { normalizeTier, type PlanTier } from '@/lib/plan-limits'
import {
  coreNavFeatureOptions,
  describeClientNavFeaturesMode,
  REQUIRED_NAV_FEATURE_IDS,
} from '@/lib/client-nav-features'
import { DEFAULT_SIDEBAR_NAV_ORDER, type SidebarNavItemId } from '@/lib/sidebar-nav'
import { ClientPaidAddonsPanel } from '../PaidAddonsAdmin'
import { ClientAttendanceTagsPanel } from '../ClientAttendanceTagsPanel'
import { ClientLogoUpload } from '../ClientLogoUpload'
import { ClientInvitePanel } from '../ClientInvitePanel'
import { ClientRecoverTicketMediaPanel } from '../ClientRecoverTicketMediaPanel'
import { formatEffectiveLimit, previewClientLimits } from '../helpers'
import type { ClientRow, ClientTask, EditState, PlanCatalogRow } from '../types'

function TaskShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="sa-task">
      <header className="sa-hub-header">
        <button type="button" className="sa-back-btn" onClick={onBack}>
          → חזרה ללקוח
        </button>
        <h2>{title}</h2>
      </header>
      <div className="sa-task-body">{children}</div>
    </div>
  )
}

export type ClientTaskViewProps = {
  task: Exclude<ClientTask, 'hub'>
  client: ClientRow
  secret: string
  catalog: PlanCatalogRow[]
  editState: EditState
  setEditState: (updater: (s: EditState) => EditState) => void
  onPlanTierChange: (tier: string) => void
  onClearOverrides: () => void
  saving: boolean
  saveError: string
  onSavePlan: () => void
  featuresDraft: SidebarNavItemId[]
  setFeaturesDraft: (updater: (prev: SidebarNavItemId[]) => SidebarNavItemId[]) => void
  savingFeatures: boolean
  featuresError: string
  onSaveFeatures: () => void
  onClearFeatures: () => void
  onApplySetupPreset: () => void
  onApplyAllFeatures: () => void
  deleteConfirmName: string
  setDeleteConfirmName: (v: string) => void
  deleting: boolean
  deleteError: string
  onDelete: () => void
  onUploadedLogo: (url: string) => void
  onBack: () => void
}

export function ClientTaskView(p: ClientTaskViewProps) {
  if (p.task === 'plan') {
    const preview = previewClientLimits(p.editState, p.catalog)
    return (
      <TaskShell title="מנוי ומכסות" onBack={p.onBack}>
        <p className="sa-hint">החבילה והמכסות של הלקוח. שינוי תוכנית מאפס מכסות מותאמות.</p>
        <div className="sa-form-stack">
          <label className="sa-field">
            <span>שם לקוח</span>
            <input
              className="sa-input"
              value={p.editState.name}
              onChange={(e) => p.setEditState((s) => ({ ...s, name: e.target.value }))}
            />
          </label>
          <label className="sa-field">
            <span>WA Phone Number ID</span>
            <input
              className="sa-input"
              value={p.editState.whatsapp_phone_number_id}
              placeholder="ריק = ללא WhatsApp"
              onChange={(e) => p.setEditState((s) => ({ ...s, whatsapp_phone_number_id: e.target.value }))}
            />
          </label>
          <label className="sa-field">
            <span>טלפון מנהל</span>
            <input
              className="sa-input"
              value={p.editState.manager_phone}
              placeholder="972501234567"
              onChange={(e) => p.setEditState((s) => ({ ...s, manager_phone: e.target.value }))}
            />
          </label>
          <label className="sa-field">
            <span>שם שולח SMS</span>
            <input
              className="sa-input"
              value={p.editState.sms_sender_name}
              placeholder="Bino"
              onChange={(e) => p.setEditState((s) => ({ ...s, sms_sender_name: e.target.value }))}
            />
          </label>
          <label className="sa-field">
            <span>תוכנית</span>
            <select
              className="sa-input"
              value={p.editState.plan_tier}
              onChange={(e) => p.onPlanTierChange(e.target.value)}
            >
              {PLAN_SETUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <small>ברירת מחדל: {planLimitsLine(normalizeTier(p.editState.plan_tier) as PlanTier)}</small>
          </label>
          <label className="sa-field">
            <span>מכסת עובדים (override)</span>
            <input
              type="number"
              min={1}
              className="sa-input"
              value={p.editState.max_workers}
              placeholder="ריק = לפי תוכנית"
              onChange={(e) => p.setEditState((s) => ({ ...s, max_workers: e.target.value }))}
            />
          </label>
          <label className="sa-field">
            <span>מכסת בניינים (override)</span>
            <input
              type="number"
              min={1}
              className="sa-input"
              value={p.editState.buildings_allowed}
              placeholder="ריק = לפי תוכנית"
              onChange={(e) => p.setEditState((s) => ({ ...s, buildings_allowed: e.target.value }))}
            />
          </label>
          <label className="sa-field">
            <span>מכסת תקלות/חודש (override)</span>
            <input
              type="number"
              min={1}
              className="sa-input"
              value={p.editState.max_tickets_per_month}
              placeholder="ריק = לפי תוכנית"
              onChange={(e) => p.setEditState((s) => ({ ...s, max_tickets_per_month: e.target.value }))}
            />
          </label>
        </div>
        <div className="sa-sticky-preview">
          <strong>מכסה בפועל:</strong> עובדים {formatEffectiveLimit(preview.workers)} · בניינים{' '}
          {formatEffectiveLimit(preview.buildings)} · תקלות/חודש {formatEffectiveLimit(preview.tickets)}
        </div>
        {p.saveError ? <p className="sa-error">{p.saveError}</p> : null}
        <div className="sa-task-actions">
          <LoadingButton onClick={p.onSavePlan} loading={p.saving} loadingText="שומר…">
            שמור
          </LoadingButton>
          <button type="button" className="sa-quick-btn" onClick={p.onClearOverrides}>
            אפס מכסות מותאמות
          </button>
        </div>
      </TaskShell>
    )
  }

  if (p.task === 'nav') {
    const mode = describeClientNavFeaturesMode(p.client.enabled_nav_features)
    return (
      <TaskShell title="תפריט ניווט" onBack={p.onBack}>
        <p className="sa-hint">
          מצב:{' '}
          {mode === 'legacy_unlimited'
            ? 'לגסי · הכל'
            : mode === 'setup_package'
              ? 'חבילת הקמה'
              : 'מותאם'}
          .
        </p>
        <div className="sa-chip-row">
          <button type="button" className="sa-filter-chip" onClick={p.onApplySetupPreset}>
            חבילת הקמה
          </button>
          <button type="button" className="sa-filter-chip" onClick={p.onApplyAllFeatures}>
            כל הלשוניות
          </button>
          <button
            type="button"
            className="sa-filter-chip"
            disabled={p.savingFeatures}
            onClick={p.onClearFeatures}
          >
            לגסי · ללא הגבלה
          </button>
        </div>
        <div className="sa-toggle-list">
          {coreNavFeatureOptions().map(({ id, label }) => {
            const required = (REQUIRED_NAV_FEATURE_IDS as readonly string[]).includes(id)
            return (
              <label key={id} className="sa-toggle-row">
                <input
                  type="checkbox"
                  checked={p.featuresDraft.includes(id)}
                  disabled={required}
                  onChange={(e) =>
                    p.setFeaturesDraft((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(id)
                      else next.delete(id)
                      for (const r of REQUIRED_NAV_FEATURE_IDS) next.add(r)
                      return DEFAULT_SIDEBAR_NAV_ORDER.filter((fid) => next.has(fid))
                    })
                  }
                />
                <span>{label}</span>
              </label>
            )
          })}
        </div>
        {p.featuresError ? <p className="sa-error">{p.featuresError}</p> : null}
        <div className="sa-task-actions">
          <LoadingButton onClick={p.onSaveFeatures} loading={p.savingFeatures} loadingText="שומר…">
            שמור הרשאות
          </LoadingButton>
        </div>
      </TaskShell>
    )
  }

  if (p.task === 'addons') {
    return (
      <TaskShell title="תוספים בתשלום" onBack={p.onBack}>
        <ClientPaidAddonsPanel clientId={p.client.id} secret={p.secret} />
      </TaskShell>
    )
  }

  if (p.task === 'buildings') {
    return (
      <TaskShell title="בניינים" onBack={p.onBack}>
        {p.client.projects.length === 0 ? (
          <p className="sa-empty">אין בניינים</p>
        ) : (
          <ul className="sa-simple-list">
            {p.client.projects.map((proj) => (
              <li key={proj.id}>
                <code>{proj.project_code}</code>
                <span>{proj.name}</span>
              </li>
            ))}
          </ul>
        )}
      </TaskShell>
    )
  }

  if (p.task === 'attendance') {
    return (
      <TaskShell title="תגי נוכחות" onBack={p.onBack}>
        <ClientAttendanceTagsPanel
          clientId={p.client.id}
          secret={p.secret}
          projects={p.client.projects}
        />
      </TaskShell>
    )
  }

  if (p.task === 'invite') {
    return (
      <TaskShell title="הזמנת משתמש" onBack={p.onBack}>
        <ClientInvitePanel
          clientId={p.client.id}
          defaultEmail={p.client.admin_email}
          secret={p.secret}
        />
      </TaskShell>
    )
  }

  if (p.task === 'logo') {
    return (
      <TaskShell title="לוגו" onBack={p.onBack}>
        <ClientLogoUpload
          clientId={p.client.id}
          clientName={p.client.name}
          currentLogoUrl={p.client.logo_url}
          secret={p.secret}
          onUploaded={p.onUploadedLogo}
        />
      </TaskShell>
    )
  }

  if (p.task === 'recover') {
    return (
      <TaskShell title="שחזור מדיה לתקלה" onBack={p.onBack}>
        <ClientRecoverTicketMediaPanel clientId={p.client.id} secret={p.secret} />
      </TaskShell>
    )
  }

  return (
    <TaskShell title="מחיקת לקוח" onBack={p.onBack}>
      <p className="sa-hint" style={{ color: theme.colors.error }}>
        פעולה בלתי הפיכה. הקלידו את שם הלקוח <strong>{p.client.name}</strong> לאישור.
      </p>
      <input
        className="sa-input"
        value={p.deleteConfirmName}
        onChange={(e) => p.setDeleteConfirmName(e.target.value)}
        placeholder={p.client.name}
      />
      {p.deleteError ? <p className="sa-error">{p.deleteError}</p> : null}
      <div className="sa-task-actions">
        <LoadingButton
          onClick={p.onDelete}
          loading={p.deleting}
          loadingText="מוחק…"
          variant="danger"
          disabled={p.deleteConfirmName.trim() !== p.client.name.trim()}
        >
          אישור מחיקה
        </LoadingButton>
      </div>
    </TaskShell>
  )
}
