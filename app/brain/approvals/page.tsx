import { BrainShell } from '../components/BrainShell'

export default function ApprovalsPage() {
  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="mbrain-card max-w-2xl p-8">
        <h2 className="text-3xl font-semibold text-white">אישורים</h2>
        <p className="mt-3 text-sm text-[var(--mbrain-muted)]">
          Phase F: מנוע אישורים להשקה, העלאת תקציב ושינויים רגישים — עם מי אישר, מתי, תקציב ו-payload מדויק.
        </p>
      </div>
    </BrainShell>
  )
}
