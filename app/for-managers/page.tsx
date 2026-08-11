import type { Metadata } from 'next'
import { ForManagersLanding } from '../components/marketing/ForManagersLanding'

export const metadata: Metadata = {
  title: 'במקור למנהלי בניינים ואחזקה',
  description:
    'תקלות, דיירים ועובדים — בלי לנהל את זה בצ׳אטים פזורים. ערוץ דיווח לדיירים, שולחן ניהול למשרד, ושיבוץ לעובדי השטח.',
  openGraph: {
    title: 'במקור — למנהלי בניינים ואחזקה',
    description:
      'ערוץ דיווח לדיירים, שולחן ניהול למשרד, ושיבוץ לעובדי השטח — במקום אחד.',
    locale: 'he_IL',
    type: 'website',
  },
}

export default function ForManagersPage() {
  return <ForManagersLanding />
}
