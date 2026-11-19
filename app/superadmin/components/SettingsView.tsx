'use client'

import { PaidAddonsCatalogAdmin } from '../PaidAddonsAdmin'
import { PlanPricingCatalogAdmin } from '../PlanPricingAdmin'

export function SettingsView({
  secret,
  onStartLaunch,
}: {
  secret?: string
  onStartLaunch?: () => void
}) {
  return (
    <div className="sa-settings-view">
      {onStartLaunch ? (
        <button type="button" className="sa-setup-cta" onClick={onStartLaunch}>
          + הקמת לקוח חדש (אשף מלא)
        </button>
      ) : (
        <a href="/superadmin#launch/new" className="sa-setup-cta">
          + הקמת לקוח חדש (אשף מלא)
        </a>
      )}
      <p className="sa-hint" style={{ marginTop: 8, marginBottom: 16 }}>
        אשף הקמה מקצה לקצה: בניינים, דיירים (Excel), WhatsApp, Grow, Financy, PalGate.{' '}
        מדריך: <code>docs/CLIENT_LAUNCH.md</code>
      </p>

      <section className="sa-settings-block sa-settings-block--flush">
        <PlanPricingCatalogAdmin secret={secret} />
      </section>

      <section className="sa-settings-block sa-settings-block--flush">
        <PaidAddonsCatalogAdmin secret={secret} />
      </section>
    </div>
  )
}
