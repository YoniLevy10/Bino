import type { Metadata } from 'next'
import { ResidentShell } from '@/app/components/resident/ResidentShell'

export const metadata: Metadata = {
  title: 'פורטל דיירים',
  robots: { index: false, follow: false, nocache: true },
}

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  return <ResidentShell>{children}</ResidentShell>
}
