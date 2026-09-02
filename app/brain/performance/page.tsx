import { BrainShell } from '../components/BrainShell'

export default function PerformancePage() {
  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="mbrain-card max-w-2xl p-8">
        <h2 className="text-3xl font-semibold text-white">ביצועים</h2>
        <p className="mt-3 text-sm text-[var(--mbrain-muted)]">
          Phase G–H: סנכרון Insights ל-PostgreSQL, לוח בקרה על snapshots בלבד (לא המצאת מדדים), ו-Performance
          Analyst על נתונים אמיתיים.
        </p>
      </div>
    </BrainShell>
  )
}
