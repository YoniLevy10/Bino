'use client'

import { PaidAddonsCatalogAdmin } from '../PaidAddonsAdmin'
import { PlanPricingCatalogAdmin } from '../PlanPricingAdmin'

export function SettingsView({ secret }: { secret: string }) {
  return (
    <div className="sa-settings-view">
      <a href="/superadmin/setup" className="sa-setup-cta">
        + הקמת לקוח חדש
      </a>

      <section className="sa-settings-block sa-settings-block--flush">
        <PlanPricingCatalogAdmin secret={secret} />
      </section>

      <section className="sa-settings-block sa-settings-block--flush">
        <PaidAddonsCatalogAdmin secret={secret} />
      </section>
    </div>
  )
}
