'use client'

import { PaidAddonsCatalogAdmin } from '../PaidAddonsAdmin'
import { PlanPricingCatalogAdmin } from '../PlanPricingAdmin'

export function SettingsView({ secret }: { secret: string }) {
  return (
    <div className="sa-settings-view">
      <a href="/superadmin/setup" className="sa-setup-cta">
        + הקמת לקוח חדש
      </a>
      <p className="sa-hint" style={{ marginTop: 8, marginBottom: 16 }}>
        אחרי יצירה — היכנסו ללקוח → <strong>צ׳קליסט הקמה</strong>. מדריך מלא:{' '}
        <code>docs/CLIENT_LAUNCH.md</code> (Vercel אחד, Meta App אחת, מספרים/Grow/מייל פר-לקוח).
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
