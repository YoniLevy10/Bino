import { BrainShell } from '../components/BrainShell'

export default function CampaignsPage() {
  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="mbrain-card max-w-2xl p-8">
        <h2 className="text-3xl font-semibold text-white">קמפיינים</h2>
        <p className="mt-3 text-sm text-[var(--mbrain-muted)]">
          Phase E–F: המרת תוכנית מאושרת לאובייקטי Meta אמיתיים (Campaign → Ad Set → Ad) עם תצוגה מקדימה,
          idempotency ואישור השקה.
        </p>
      </div>
    </BrainShell>
  )
}
