'use client'

import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import { formatEffectiveLimit, effectiveLimitsForClient } from '../helpers'
import type { ClientRow, ClientTask, PlanCatalogRow } from '../types'
import { PLAN_COLORS, PLAN_LABELS } from '../types'
import { CopyButton } from './CopyButton'

const ACTIONS: { task: Exclude<ClientTask, 'hub'>; label: string; danger?: boolean }[] = [
  { task: 'plan', label: 'מנוי ומכסות' },
  { task: 'nav', label: 'תפריט ניווט' },
  { task: 'addons', label: 'תוספים בתשלום' },
  { task: 'buildings', label: 'בניינים' },
  { task: 'attendance', label: 'תגי נוכחות / NFC' },
  { task: 'invite', label: 'הזמנת משתמש' },
  { task: 'logo', label: 'לוגו' },
  { task: 'recover', label: 'שחזור מדיה לתקלה' },
  { task: 'delete', label: 'מחיקת לקוח', danger: true },
]

export function ClientHub({
  client,
  catalog,
  magicLink,
  magicLoading,
  onBack,
  onOpenTask,
  onMagicLink,
}: {
  client: ClientRow
  catalog: PlanCatalogRow[]
  magicLink?: string
  magicLoading?: boolean
  onBack: () => void
  onOpenTask: (task: ClientTask) => void
  onMagicLink: () => void
}) {
  const limits = effectiveLimitsForClient(client, catalog)
  const planColor = PLAN_COLORS[client.plan_tier] ?? '#6b7280'

  return (
    <div className="sa-hub">
      <header className="sa-hub-header">
        <button type="button" className="sa-back-btn" onClick={onBack}>
          → חזרה
        </button>
        <h2>{client.name}</h2>
      </header>

      <div className="sa-hub-summary">
        <div className="sa-hub-summary-row">
          <span className="sa-plan-pill" style={{ background: planColor }}>
            {PLAN_LABELS[client.plan_tier] ?? client.plan_tier}
          </span>
          <span className="sa-hub-limits">
            עובדים {client.workers_active_count}/{formatEffectiveLimit(limits.workers)} · בניינים{' '}
            {client.buildings_count}/{formatEffectiveLimit(limits.buildings)} · קריאות{' '}
            {client.open_tickets_count}
          </span>
        </div>
        <div className="sa-hub-contacts">
          {client.manager_phone ? (
            <a href={`tel:${client.manager_phone}`} className="sa-link">
              {client.manager_phone}
            </a>
          ) : (
            <span style={{ color: theme.colors.textMuted }}>אין טלפון מנהל</span>
          )}
          <span>·</span>
          <span>{client.whatsapp_phone_number_id ? 'WhatsApp מחובר' : 'ללא WhatsApp'}</span>
        </div>
        {client.admin_email ? (
          <div className="sa-hub-email">
            <span dir="ltr">{client.admin_email}</span>
            <CopyButton text={client.admin_email} label="אימייל" />
          </div>
        ) : null}
      </div>

      <div className="sa-hub-primary">
        {magicLink ? (
          <div className="sa-magic-box">
            <code dir="ltr">{magicLink}</code>
            <div className="sa-magic-actions">
              <CopyButton text={magicLink} label="קישור" />
              <a
                href={magicLink}
                target="_blank"
                rel="noreferrer"
                className="sa-quick-btn sa-quick-btn--primary"
              >
                פתח
              </a>
            </div>
          </div>
        ) : (
          <LoadingButton
            onClick={onMagicLink}
            loading={!!magicLoading}
            loadingText="יוצר קישור…"
            disabled={!client.admin_email}
            style={{ width: '100%', minHeight: 48 }}
          >
            כניסה כלקוח
          </LoadingButton>
        )}
        {!client.admin_email ? (
          <p className="sa-hint">אין אימייל אדמין — הגדירו הזמנה קודם</p>
        ) : null}
      </div>

      <div className="sa-action-grid">
        {ACTIONS.map((a) => (
          <button
            key={a.task}
            type="button"
            className={`sa-action-tile${a.danger ? ' is-danger' : ''}`}
            onClick={() => onOpenTask(a.task)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
