import { BrainShell } from '../components/BrainShell'

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="mbrain-card max-w-2xl p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--mbrain-muted)]">Phase roadmap</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--mbrain-muted)]">{body}</p>
      </div>
    </BrainShell>
  )
}

export default function StrategyPage() {
  return (
    <Placeholder
      title="אסטרטגיה"
      body="Phase B: Marketing Director יקבל יעד עסקי (לידים, CPL, תקציב) ויפיק Campaign Plan מובנה ב-Zod לאישור לפני יצירת קמפיין."
    />
  )
}
