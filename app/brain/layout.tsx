import type { Metadata } from 'next'
import './brain.css'

export const metadata: Metadata = {
  title: 'Levy Marketing Brain',
  description: 'מפעיל שיווק AI — אסטרטגיה, קריאייטיב, Meta וביצועים',
}

export default function BrainLayout({ children }: { children: React.ReactNode }) {
  return children
}
