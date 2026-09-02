import { BrainShell } from '../components/BrainShell'

export default function CreativesPage() {
  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="mbrain-card max-w-2xl p-8">
        <h2 className="text-3xl font-semibold text-white">ספריית קריאייטיב</h2>
        <p className="mt-3 text-sm text-[var(--mbrain-muted)]">
          Phase C: קופי מקושר להשערות, תבניות 1:1 / 4:5 / 9:16 בעלות אפסית, ואופציה ליצירת תמונות
          דרך ImageGenerationProvider.
        </p>
      </div>
    </BrainShell>
  )
}
